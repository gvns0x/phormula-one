import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createTrack } from './Track';
import { createCar } from './Car';
import { createChaseCamera } from './Camera';

const FIXED_DT = 1 / 60;
const MAX_SPEED = 85;
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
  tex.repeat.set(80, 80);
  return tex;
}

export function createGameEngine(canvasRef, getInput, options) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 150, 500);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(0, 10, 20);

  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvasRef.current });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const ambient = new THREE.AmbientLight(0x404040);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(50, 100, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -200;
  sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 500;
  scene.add(sun);

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
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness: 1 })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.01;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const { group: trackGroup, startPosition } = createTrack();
  scene.add(trackGroup);

  const { group: carGroup, applyInput, sync, loadModel, getSpeed } = createCar(world, startPosition);
  scene.add(carGroup);

  loadModel(CAR_MODEL_URL);

  const chaseCam = createChaseCamera(camera);

  let rafId = null;
  let acc = 0;

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
    options?.onTick?.({ speed });
    const speedRatio = Math.min(Math.abs(speed) / MAX_SPEED, 1);
    chaseCam.update(carGroup, speedRatio);
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

  return { start, stop, resize };
}
