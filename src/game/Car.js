/**
 * F1-style car: Three.js mesh + Cannon-es rigid body.
 * Supports procedural fallback and optional GLB model loading.
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { tuning } from './tuning';
import { createGearbox } from './gearbox';

const WIDTH = 2;
const HEIGHT = 0.6;
const DEPTH = 4.2;
const MASS = 700;

export function createCar(world, startPos, startRotationY) {
  const group = new THREE.Group();

  const bodyGeom = new THREE.BoxGeometry(WIDTH * 0.9, HEIGHT * 0.8, DEPTH * 0.85);
  const cabinGeom = new THREE.BoxGeometry(WIDTH * 0.6, HEIGHT * 0.5, DEPTH * 0.4);
  cabinGeom.translate(0, 0.15, 0.2);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  const cabin = new THREE.Mesh(cabinGeom, cabinMat);
  body.castShadow = true;
  cabin.castShadow = true;
  group.add(body);
  group.add(cabin);

  const proceduralMeshes = [body, cabin];

  const shape = new CANNON.Box(new CANNON.Vec3(WIDTH / 2, HEIGHT / 2, DEPTH / 2));
  const carMaterial = new CANNON.Material({ friction: 0.05, restitution: 0.1 });
  const bodyPhys = new CANNON.Body({ mass: MASS, shape, material: carMaterial });
  const sp = startPos || { x: 0, y: 1, z: 0 };
  bodyPhys.position.set(sp.x, sp.y, sp.z);
  if (startRotationY !== undefined) {
    bodyPhys.quaternion.setFromEuler(0, startRotationY, 0);
  }
  bodyPhys.linearDamping = 0.1;
  world.addBody(bodyPhys);

  let damage = 0;

  bodyPhys.addEventListener('collide', (e) => {
    const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (impact > 3) {
      const intensity = Math.min(impact / 30, 1);
      damage = Math.min(damage + intensity * 0.55, 1);
      bodyPhys.angularVelocity.y += (Math.random() - 0.5) * impact * 0.8;
      bodyPhys.angularVelocity.x += (Math.random() - 0.5) * intensity * 3;
      bodyPhys.angularVelocity.z += (Math.random() - 0.5) * intensity * 3;
      bodyPhys.velocity.y += impact * 0.25;
    }
  });

  function getDamage() { return damage; }
  function resetDamage() { damage = 0; }

  let steerAngle = 0;
  let lastSpeed = 0;
  let lastGear = 1;
  let lastRpm = 0;
  const gearbox = createGearbox();
  const forward = new CANNON.Vec3();
  const right = new CANNON.Vec3();

  function applyInput(steer, throttle, brake, dt, reverse = 0, drsBoost = 0) {
    const { steerMax, steerRate, brakeForce, engineForce, acceleration, coastingDecay, lateralGrip } = tuning;
    const maxSpeed = ((tuning.maxSpeed ?? 0) * (1 + drsBoost)) / 3.6;
    const reverseMaxSpeed = maxSpeed * 0.3;
    bodyPhys.linearDamping = tuning.linearDamping;

    steerAngle = THREE.MathUtils.clamp(-steer * steerMax, -steerMax, steerMax);
    bodyPhys.quaternion.vmult(new CANNON.Vec3(0, 0, 1), forward);

    const speed = bodyPhys.velocity.dot(forward);
    lastSpeed = speed;
    const { gear, rpm } = gearbox.update(Math.abs(speed) * 3.6);
    lastGear = speed < -0.5 ? 'R' : gear;
    lastRpm = rpm;

    if (throttle > 0 && speed < maxSpeed) {
      const acc = (engineForce / MASS) * acceleration * throttle * dt;
      bodyPhys.velocity.x += forward.x * acc;
      bodyPhys.velocity.z += forward.z * acc;
    }

    if (brake > 0 && speed > 1) {
      const damp = 1 - Math.min(brake * brakeForce * dt, 0.95);
      bodyPhys.velocity.x *= damp;
      bodyPhys.velocity.z *= damp;
    } else if (brake > 0 && speed <= 1 && throttle === 0) {
      reverse = Math.max(reverse, brake);
    }

    if (reverse > 0 && speed > -reverseMaxSpeed) {
      const acc = (engineForce / MASS) * acceleration * reverse * dt * 0.3;
      bodyPhys.velocity.x -= forward.x * acc;
      bodyPhys.velocity.z -= forward.z * acc;
    }

    if (throttle === 0 && brake === 0 && reverse === 0 && Math.abs(speed) > 0.5) {
      bodyPhys.velocity.x *= (1 - coastingDecay * dt);
      bodyPhys.velocity.z *= (1 - coastingDecay * dt);
    }

    const absSpeed = Math.abs(speed);
    bodyPhys.angularVelocity.y = steerAngle * steerRate * (absSpeed > 1 ? 1 : absSpeed) * (speed < -0.5 ? -1 : 1);

    bodyPhys.quaternion.vmult(new CANNON.Vec3(1, 0, 0), right);
    const lateralSpeed = bodyPhys.velocity.dot(right);
    const gripFactor = Math.min(lateralGrip * dt, 1);
    bodyPhys.velocity.x -= right.x * lateralSpeed * gripFactor;
    bodyPhys.velocity.z -= right.z * lateralSpeed * gripFactor;
  }

  function sync() {
    group.position.copy(bodyPhys.position);
    group.position.y += tuning.carHeightOffset ?? 0;
    group.quaternion.copy(bodyPhys.quaternion);
    const scale = tuning.carSize ?? 1;
    group.scale.setScalar(scale);
  }

  function loadModel(url) {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);

        const scaleX = WIDTH / size.x;
        const scaleY = HEIGHT / size.y;
        const scaleZ = DEPTH / size.z;
        const scale = Math.min(scaleX, scaleY, scaleZ);
        model.scale.setScalar(scale);

        box.setFromObject(model);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center);

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        proceduralMeshes.forEach((m) => {
          group.remove(m);
          m.geometry?.dispose();
          m.material?.dispose();
        });
        group.add(model);
      },
      undefined,
      (err) => {
        console.warn('F1 car model failed to load, using procedural fallback:', err);
      }
    );
  }

  function reset(pos, rotY) {
    bodyPhys.position.set(pos.x, pos.y, pos.z);
    bodyPhys.quaternion.setFromEuler(0, rotY, 0);
    bodyPhys.velocity.setZero();
    bodyPhys.angularVelocity.setZero();
    lastSpeed = 0;
    lastGear = 1;
    lastRpm = 0;
    steerAngle = 0;
    gearbox.reset();
  }

  function getSpeed() {
    return lastSpeed;
  }

  function getGear() {
    return lastGear;
  }

  function getRpm() {
    return lastRpm;
  }

  return {
    group,
    body: bodyPhys,
    applyInput,
    sync,
    loadModel,
    getSpeed,
    getGear,
    getRpm,
    getDamage,
    resetDamage,
    reset,
  };
}

const GHOST_MAT = new THREE.MeshStandardMaterial({
  color: 0x00ff88,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

export function createGhostCar() {
  const group = new THREE.Group();

  const bodyGeom = new THREE.BoxGeometry(WIDTH * 0.9, HEIGHT * 0.8, DEPTH * 0.85);
  const cabinGeom = new THREE.BoxGeometry(WIDTH * 0.6, HEIGHT * 0.5, DEPTH * 0.4);
  cabinGeom.translate(0, 0.15, 0.2);

  group.add(new THREE.Mesh(bodyGeom, GHOST_MAT));
  group.add(new THREE.Mesh(cabinGeom, GHOST_MAT));

  const loader = new GLTFLoader();
  loader.load(
    '/models/f1-car.glb',
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = Math.min(WIDTH / size.x, HEIGHT / size.y, DEPTH / size.z);
      model.scale.setScalar(scale);
      box.setFromObject(model);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.sub(center);
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = GHOST_MAT;
        }
      });
      while (group.children.length) group.remove(group.children[0]);
      group.add(model);
    },
    undefined,
    () => {}
  );

  group.visible = false;
  return group;
}
