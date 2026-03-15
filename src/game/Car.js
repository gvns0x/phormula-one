/**
 * F1-style car: Three.js mesh + Cannon-es rigid body.
 * Supports procedural fallback and optional GLB model loading.
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const WIDTH = 2;
const HEIGHT = 0.6;
const DEPTH = 4.2;
const MASS = 700;
const STEER_MAX = 0.35;
const ENGINE_FORCE = 12000;
const BRAKE_FORCE = 80;
const MAX_SPEED = 85;

export function createCar(world, startPos) {
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
  bodyPhys.linearDamping = 0.1;
  world.addBody(bodyPhys);

  let steerAngle = 0;
  let lastSpeed = 0;
  const forward = new CANNON.Vec3();

  function applyInput(steer, throttle, brake, dt) {
    steerAngle = THREE.MathUtils.clamp(-steer * STEER_MAX, -STEER_MAX, STEER_MAX);
    bodyPhys.quaternion.vmult(new CANNON.Vec3(0, 0, 1), forward);

    const speed = bodyPhys.velocity.dot(forward);
    lastSpeed = speed;
    if (throttle > 0 && speed < MAX_SPEED) {
      const acc = (ENGINE_FORCE / MASS) * throttle * dt;
      bodyPhys.velocity.x += forward.x * acc;
      bodyPhys.velocity.z += forward.z * acc;
    }
    if (brake > 0) {
      const damp = 1 - Math.min(brake * BRAKE_FORCE * dt, 0.95);
      bodyPhys.velocity.x *= damp;
      bodyPhys.velocity.z *= damp;
    }
    if (throttle === 0 && brake === 0 && speed > 0.5) {
      bodyPhys.velocity.x *= (1 - 0.3 * dt);
      bodyPhys.velocity.z *= (1 - 0.3 * dt);
    }
    bodyPhys.angularVelocity.y = steerAngle * 4 * (speed > 1 ? 1 : speed);
  }

  function sync() {
    group.position.copy(bodyPhys.position);
    group.quaternion.copy(bodyPhys.quaternion);
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

  function getSpeed() {
    return lastSpeed;
  }

  return {
    group,
    body: bodyPhys,
    applyInput,
    sync,
    loadModel,
    getSpeed,
  };
}
