import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createTrack } from './Track';
import { createCar, createGhostCar } from './Car';
import { createChaseCamera } from './Camera';
import { createEnvironment } from './Environment';
import { tuning } from './tuning';

const FIXED_DT = 1 / 60;
const CAR_MODEL_URL = '/models/f1-car.glb';

function createGroundTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a7d2c';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#2d6821';
  ctx.lineWidth = 2;
  const step = size / 4;
  for (let x = 0; x <= size; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }
  for (let y = 0; y <= size; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(120, 120);
  return tex;
}

export function createGameEngine(canvasRef, getInput, options) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 200, 900);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(0, 10, 20);

  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvasRef.current });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const ambient = new THREE.AmbientLight(0x404040);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(200, 300, -50);
  sun.target.position.set(110, 0, 130);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 4096;
  sun.shadow.mapSize.height = 4096;
  sun.shadow.camera.left = -450;
  sun.shadow.camera.right = 450;
  sun.shadow.camera.top = 450;
  sun.shadow.camera.bottom = -450;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  scene.add(sun.target);

  const world = new CANNON.World();
  world.gravity.set(0, -25, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;

  const groundMat = new CANNON.Material({ friction: 0.0, restitution: 0.0 });
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({ mass: 0, material: groundMat });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // Visible ground with grass grid texture
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness: 1 })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.01;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const { group: trackGroup, startPosition, startRotationY, startTangent, isOffTrack, setRacingLineVisible, setCornerLabelsVisible, getNearestIndex, drsStartIdx, drsEndIdx, pts: trackPts, halfWidths: trackHW } = createTrack(world);
  scene.add(trackGroup);

  const { group: carGroup, body: carBody, applyInput, sync, loadModel, getSpeed, getGear, getRpm, getDamage, resetDamage, reset: carReset } = createCar(world, startPosition, startRotationY);
  scene.add(carGroup);

  const envGroup = createEnvironment(trackPts, trackHW, world);
  scene.add(envGroup);

  const ghostGroup = createGhostCar();
  scene.add(ghostGroup);

  let ghostData = null;
  let ghostFrameIdx = 0;
  let ghostPaused = true;

  function setGhostData(frames) {
    ghostData = frames;
    ghostFrameIdx = 0;
  }

  function setGhostVisible(v) {
    ghostGroup.visible = v && ghostData != null;
  }

  function resetGhostPlayback() {
    ghostFrameIdx = 0;
  }

  function setGhostPaused(v) {
    ghostPaused = v;
  }

  let drsActive = false;
  let wreckCounter = 0;
  const WRECK_THRESHOLD = 60;

  function isInDrsZone(idx) {
    if (drsStartIdx < drsEndIdx) return idx >= drsStartIdx && idx <= drsEndIdx;
    return idx >= drsStartIdx || idx <= drsEndIdx;
  }

  function activateDrs() {
    const idx = getNearestIndex(carBody.position.x, carBody.position.z);
    if (isInDrsZone(idx)) drsActive = true;
  }

  let prevSignedDist = 0;

  loadModel(CAR_MODEL_URL);

  const chaseCam = createChaseCamera(camera);

  let rafId = null;
  let acc = 0;
  let droneView = false;

  const DRONE_POS = new THREE.Vector3(68, 400, 24);
  const DRONE_LOOK = new THREE.Vector3(68, 0, 24);
  const DRONE_FOV = 60;

  function setDroneView(enabled) {
    droneView = enabled;
    if (droneView) {
      camera.fov = DRONE_FOV;
      camera.updateProjectionMatrix();
      camera.position.copy(DRONE_POS);
      camera.lookAt(DRONE_LOOK);
    }
  }

  function resize() {
    const w = canvasRef.current?.clientWidth ?? 1;
    const h = canvasRef.current?.clientHeight ?? 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function tick(dt) {
    acc += Math.min(dt, 0.1);
    let offTrack = false;
    while (acc >= FIXED_DT && acc > 0) {
      const input = getInput ? getInput() : { steer: 0, throttle: 0, brake: 0 };
      if (drsActive && (input.brake ?? 0) > 0) drsActive = false;
      applyInput(input.steer ?? 0, input.throttle ?? 0, input.brake ?? 0, FIXED_DT, input.reverse ?? 0, drsActive ? 0.90 : 0);
      world.step(FIXED_DT);
      if (!offTrack && isOffTrack(carBody.position.x, carBody.position.z)) {
        offTrack = true;
      }
      acc -= FIXED_DT;
    }
    sync();
    const speed = getSpeed();

    const trackIdx = getNearestIndex(carBody.position.x, carBody.position.z);
    const inDrsZone = isInDrsZone(trackIdx);
    if (drsActive && !inDrsZone) drsActive = false;

    const dx = carGroup.position.x - startPosition.x;
    const dz = carGroup.position.z - startPosition.z;
    const signedDist = dx * startTangent.x + dz * startTangent.z;
    const crossed = prevSignedDist < 0 && signedDist >= 0;
    prevSignedDist = signedDist;

    if (ghostGroup.visible && ghostData && ghostData.length > 0) {
      const f = ghostData[ghostFrameIdx];
      ghostGroup.position.set(f.x, f.y, f.z);
      ghostGroup.quaternion.set(f.qx, f.qy, f.qz, f.qw);
      const s2 = tuning.carSize ?? 1;
      ghostGroup.scale.setScalar(s2);
      ghostGroup.position.y += tuning.carHeightOffset ?? 0;
      if (!ghostPaused) {
        ghostFrameIdx = (ghostFrameIdx + 1) % ghostData.length;
      }
    }

    const upVec = new CANNON.Vec3();
    carBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0), upVec);
    if (upVec.y < 0.2) {
      wreckCounter++;
    } else {
      wreckCounter = 0;
    }
    const carWrecked =
      wreckCounter >= WRECK_THRESHOLD ||
      carBody.position.y < -5 ||
      carBody.position.y > 8;

    const gear = getGear();
    const rpm = getRpm();
    const damage = getDamage();
    const carPos = { x: carBody.position.x, y: carBody.position.y, z: carBody.position.z };
    const carQuat = { x: carBody.quaternion.x, y: carBody.quaternion.y, z: carBody.quaternion.z, w: carBody.quaternion.w };
    const ghostPos = (ghostGroup.visible && ghostData && ghostData.length > 0)
      ? { x: ghostGroup.position.x, z: ghostGroup.position.z }
      : null;
    options?.onTick?.({ speed, gear, rpm, crossed, offTrack, carPos, carQuat, inDrsZone, drsActive, damage, carWrecked, ghostPos });
    if (!droneView) {
      const speedRatio = Math.min(Math.abs(speed) / tuning.maxSpeed, 1);
      chaseCam.update(carGroup, speedRatio);
    }
    renderer.render(scene, camera);
  }

  function loop(now = 0) {
    const prev = loop.last ?? now;
    loop.last = now;
    tick((now - prev) / 1000);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    resize();
    window.addEventListener('resize', resize);
    loop();
  }

  function stop() {
    window.removeEventListener('resize', resize);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function resetCar() {
    carReset(startPosition, startRotationY);
    prevSignedDist = 0;
    wreckCounter = 0;
    resetDamage();
  }

  return { start, stop, resize, tuning, resetCar, setDroneView, setRacingLineVisible, setCornerLabelsVisible, setGhostData, setGhostVisible, resetGhostPlayback, setGhostPaused, activateDrs, trackPts, resetDamage };
}
