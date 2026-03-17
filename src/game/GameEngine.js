import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createTrack } from './Track';
import { createCar } from './Car';
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

  const { group: trackGroup, startPosition, startRotationY, startTangent, isOffTrack, setRacingLineVisible, pts: trackPts, halfWidths: trackHW } = createTrack(world);
  scene.add(trackGroup);

  const { group: carGroup, applyInput, sync, loadModel, getSpeed, getGear, getRpm, reset: carReset } = createCar(world, startPosition, startRotationY);
  scene.add(carGroup);

  const envGroup = createEnvironment(trackPts, trackHW, world);
  scene.add(envGroup);

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
    while (acc >= FIXED_DT && acc > 0) {
      const input = getInput ? getInput() : { steer: 0, throttle: 0, brake: 0 };
      applyInput(input.steer ?? 0, input.throttle ?? 0, input.brake ?? 0, FIXED_DT);
      world.step(FIXED_DT);
      acc -= FIXED_DT;
    }
    sync();
    const speed = getSpeed();

    const dx = carGroup.position.x - startPosition.x;
    const dz = carGroup.position.z - startPosition.z;
    const signedDist = dx * startTangent.x + dz * startTangent.z;
    const crossed = prevSignedDist < 0 && signedDist >= 0;
    prevSignedDist = signedDist;

    const gear = getGear();
    const rpm = getRpm();
    const offTrack = isOffTrack(carGroup.position.x, carGroup.position.z);
    options?.onTick?.({ speed, gear, rpm, crossed, offTrack });
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
  }

  return { start, stop, resize, tuning, resetCar, setDroneView, setRacingLineVisible };
}
