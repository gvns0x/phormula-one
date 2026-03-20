import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createTrack } from './Track';
import { createCar, createGhostCar, createRivalCar } from './Car';
import { createChaseCamera } from './Camera';
import { createEnvironment } from './Environment';
import { tuning } from './tuning';
import { TRACKS } from './tracks/index';

const FIXED_DT = 1 / 60;
const CAR_MODEL_URL = '/models/f1-car.glb';

function createGroundTexture(themeId) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (themeId === 'jungle') {
    ctx.fillStyle = '#2a5e1a';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#1e4a12';
    ctx.lineWidth = 3;
    const step = size / 6;
    for (let x = 0; x <= size; x += step) {
      ctx.beginPath(); ctx.moveTo(x + Math.random() * 4, 0); ctx.lineTo(x + Math.random() * 4, size); ctx.stroke();
    }
    for (let y = 0; y <= size; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y + Math.random() * 4); ctx.lineTo(size, y + Math.random() * 4); ctx.stroke();
    }
  } else if (themeId === 'coastal') {
    ctx.fillStyle = '#8aad6a';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#7a9a5a';
    ctx.lineWidth = 1;
    const step = size / 4;
    for (let x = 0; x <= size; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    }
    for (let y = 0; y <= size; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
  } else {
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
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(120, 120);
  return tex;
}

export function createGameEngine(canvasRef, getInput, options) {
  const trackId = options?.trackId ?? 'monaco';
  const trackConfig = TRACKS[trackId] ?? TRACKS.monaco;
  const theme = trackConfig.theme;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(0, 10, 20);

  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvasRef.current });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const ambient = new THREE.AmbientLight(0x404040, theme.ambientIntensity / 0.25);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, theme.sunIntensity);
  sun.position.set(...theme.sunPosition);
  const trackBoundsCenter = trackConfig.centerline.reduce(
    (acc, [x, z]) => ({ x: acc.x + x, z: acc.z + z }),
    { x: 0, z: 0 }
  );
  const nPts = trackConfig.centerline.length;
  sun.target.position.set(trackBoundsCenter.x / nPts, 0, trackBoundsCenter.z / nPts);
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

  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ map: createGroundTexture(theme.environment), roughness: 1 })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.01;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const mode = options?.mode ?? 'timeTrial';

  const { group: trackGroup, startPosition, startRotationY, startTangent, isOffTrack, setRacingLineVisible, setCornerLabelsVisible, getNearestIndex, drsStartIdx, drsEndIdx, pts: trackPts, halfWidths: trackHW, racingLinePts } = createTrack(world, trackConfig);
  scene.add(trackGroup);

  const startRight = { x: -startTangent.z, z: startTangent.x };
  const lateralOffset = 2.5;

  const playerStartPos = mode === 'rival'
    ? { x: startPosition.x - startRight.x * lateralOffset, y: startPosition.y, z: startPosition.z - startRight.z * lateralOffset }
    : { x: startPosition.x, y: startPosition.y, z: startPosition.z };

  const rivalStartPos = {
    x: startPosition.x + startRight.x * lateralOffset,
    y: startPosition.y,
    z: startPosition.z + startRight.z * lateralOffset,
  };

  const { group: carGroup, body: carBody, applyInput, sync, loadModel, getSpeed, getGear, getRpm, getDamage, resetDamage, reset: carReset } = createCar(world, playerStartPos, startRotationY);
  scene.add(carGroup);

  const envGroup = createEnvironment(trackPts, trackHW, world, theme.environment);
  scene.add(envGroup);

  const ghostGroup = createGhostCar();
  scene.add(ghostGroup);

  let rival = null;
  if (mode === 'rival') {
    rival = createRivalCar(world, rivalStartPos, startRotationY);
    scene.add(rival.group);
    rival.loadModel(CAR_MODEL_URL);
  }

  const trackCurvature = new Float32Array(trackPts.length);
  if (mode === 'rival') {
    const nPts = trackPts.length;
    for (let i = 0; i < nPts; i++) {
      const prev = trackPts[(i - 1 + nPts) % nPts];
      const curr = trackPts[i];
      const next = trackPts[(i + 1) % nPts];
      const dx1 = curr.x - prev.x, dz1 = curr.z - prev.z;
      const dx2 = next.x - curr.x, dz2 = next.z - curr.z;
      const cross = dx1 * dz2 - dz1 * dx2;
      const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1) || 1;
      const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
      trackCurvature[i] = Math.abs(cross / (len1 * len2));
    }
  }

  let rivalPrevSignedDist = 0;
  let rivalInputPaused = true;
  let rivalCurrentIdx = 0;

  const nRlPts = racingLinePts.length;
  const rlDists = new Float32Array(nRlPts);
  for (let i = 1; i < nRlPts; i++) {
    const dx = racingLinePts[i].x - racingLinePts[i - 1].x;
    const dz = racingLinePts[i].z - racingLinePts[i - 1].z;
    rlDists[i] = rlDists[i - 1] + Math.sqrt(dx * dx + dz * dz);
  }
  const rlLast = racingLinePts[nRlPts - 1];
  const rlFirst = racingLinePts[0];
  const rlTotalLen = rlDists[nRlPts - 1] +
    Math.sqrt((rlFirst.x - rlLast.x) ** 2 + (rlFirst.z - rlLast.z) ** 2);

  let rivalDist = 0;
  let rivalSpeedMs = 0;

  if (rival) {
    rival.body.type = CANNON.Body.KINEMATIC;
    rival.body.mass = 0;
    rival.body.updateMassProperties();
  }

  const AI_MAX_SPEED_FACTOR = 0.78;

  function advanceRival(dt) {
    if (!rival || rivalInputPaused) return;

    const wrappedDist = ((rivalDist % rlTotalLen) + rlTotalLen) % rlTotalLen;
    let segIdx = 0;
    for (let i = nRlPts - 1; i >= 0; i--) {
      if (wrappedDist >= rlDists[i]) { segIdx = i; break; }
    }

    let maxCurv = 0;
    for (let i = 0; i < 70; i++) {
      const ci = (segIdx + i) % nRlPts;
      if (trackCurvature[ci] > maxCurv) maxCurv = trackCurvature[ci];
    }

    const baseMaxKmh = (tuning.maxSpeed ?? 300) * AI_MAX_SPEED_FACTOR;
    let targetKmh = baseMaxKmh;
    const curvThreshold = 0.02;
    if (maxCurv > curvThreshold) {
      const factor = Math.max(0.12, 1.0 - (maxCurv - curvThreshold) * 18);
      targetKmh = baseMaxKmh * factor;
    }
    const targetMs = targetKmh / 3.6;

    if (rivalSpeedMs < targetMs) {
      rivalSpeedMs = Math.min(rivalSpeedMs + 14 * dt, targetMs);
    } else {
      rivalSpeedMs = Math.max(rivalSpeedMs - 35 * dt, targetMs);
    }

    rivalDist += rivalSpeedMs * dt;

    const newWrapped = ((rivalDist % rlTotalLen) + rlTotalLen) % rlTotalLen;
    let newSegIdx = 0;
    for (let i = nRlPts - 1; i >= 0; i--) {
      if (newWrapped >= rlDists[i]) { newSegIdx = i; break; }
    }
    const nextIdx = (newSegIdx + 1) % nRlPts;
    const segStart = rlDists[newSegIdx];
    const segEnd = nextIdx === 0 ? rlTotalLen : rlDists[nextIdx];
    const segLen = segEnd - segStart;
    const t = segLen > 0 ? (newWrapped - segStart) / segLen : 0;

    const px = racingLinePts[newSegIdx].x + (racingLinePts[nextIdx].x - racingLinePts[newSegIdx].x) * t;
    const pz = racingLinePts[newSegIdx].z + (racingLinePts[nextIdx].z - racingLinePts[newSegIdx].z) * t;

    rival.body.position.set(px, startPosition.y, pz);

    const tx = racingLinePts[nextIdx].x - racingLinePts[newSegIdx].x;
    const tz = racingLinePts[nextIdx].z - racingLinePts[newSegIdx].z;
    const tLen = Math.sqrt(tx * tx + tz * tz) || 1;
    rival.body.quaternion.setFromEuler(0, Math.atan2(tx, tz), 0);

    rival.body.velocity.set((tx / tLen) * rivalSpeedMs, 0, (tz / tLen) * rivalSpeedMs);

    rivalCurrentIdx = newSegIdx;
  }

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

  const trackCenter = trackConfig.centerline.reduce(
    (a, [x, z]) => ({ x: a.x + x / trackConfig.centerline.length, z: a.z + z / trackConfig.centerline.length }),
    { x: 0, z: 0 }
  );
  const DRONE_POS = new THREE.Vector3(trackCenter.x, 400, trackCenter.z);
  const DRONE_LOOK = new THREE.Vector3(trackCenter.x, 0, trackCenter.z);
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
      applyInput(input.steer ?? 0, input.throttle ?? 0, input.brake ?? 0, FIXED_DT, input.reverse ?? 0, drsActive ? 0.10 : 0);
      if (rival) advanceRival(FIXED_DT);
      world.step(FIXED_DT);
      if (!offTrack && isOffTrack(carBody.position.x, carBody.position.z)) {
        offTrack = true;
      }
      acc -= FIXED_DT;
    }
    sync();
    if (rival) rival.sync();
    const speed = getSpeed();

    const trackIdx = getNearestIndex(carBody.position.x, carBody.position.z);
    const inDrsZone = isInDrsZone(trackIdx);
    if (drsActive && !inDrsZone) drsActive = false;

    const dx = carGroup.position.x - startPosition.x;
    const dz = carGroup.position.z - startPosition.z;
    const signedDist = dx * startTangent.x + dz * startTangent.z;
    const crossed = prevSignedDist < 0 && signedDist >= 0;
    prevSignedDist = signedDist;

    let rivalCrossed = false;
    let rivalTrackIdx = 0;
    let rivalSpeed = 0;
    let rivalPos = null;
    if (rival) {
      const rdx = rival.group.position.x - startPosition.x;
      const rdz = rival.group.position.z - startPosition.z;
      const rSignedDist = rdx * startTangent.x + rdz * startTangent.z;
      rivalCrossed = rivalPrevSignedDist < 0 && rSignedDist >= 0;
      rivalPrevSignedDist = rSignedDist;
      rivalTrackIdx = rivalCurrentIdx;
      rivalSpeed = rivalSpeedMs;
      rivalPos = { x: rival.body.position.x, y: rival.body.position.y, z: rival.body.position.z };
    }

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
    options?.onTick?.({ speed, gear, rpm, crossed, offTrack, carPos, carQuat, inDrsZone, drsActive, damage, carWrecked, ghostPos, trackIdx, rivalCrossed, rivalTrackIdx, rivalSpeed, rivalPos });
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
    carReset(playerStartPos, startRotationY);
    prevSignedDist = 0;
    wreckCounter = 0;
    resetDamage();
  }

  function resetRivalCar() {
    if (!rival) return;
    rival.reset(rivalStartPos, startRotationY);
    rivalPrevSignedDist = 0;
    rivalCurrentIdx = 0;
    rivalDist = 0;
    rivalSpeedMs = 0;
    rival.resetDamage();
  }

  function setRivalInputPaused(v) {
    rivalInputPaused = v;
  }

  return { start, stop, resize, tuning, resetCar, setDroneView, setRacingLineVisible, setCornerLabelsVisible, setGhostData, setGhostVisible, resetGhostPlayback, setGhostPaused, activateDrs, trackPts, resetDamage, resetRivalCar, setRivalInputPaused };
}
