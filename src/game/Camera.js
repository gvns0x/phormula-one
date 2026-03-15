import * as THREE from 'three';

const BASE_FOV = 60;
const MAX_FOV = 85;
const OFFSET_Y = 4;
const OFFSET_Z_REST = -12;
const OFFSET_Z_FAST = -8;
const SMOOTH = 0.12;

export function createChaseCamera(camera) {
  const targetPos = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const offset = new THREE.Vector3();

  function update(carGroup, speedRatio = 0) {
    if (!carGroup) return;
    const s = THREE.MathUtils.clamp(speedRatio, 0, 1);

    camera.fov = THREE.MathUtils.lerp(BASE_FOV, MAX_FOV, s);
    camera.updateProjectionMatrix();

    offset.set(0, OFFSET_Y, THREE.MathUtils.lerp(OFFSET_Z_REST, OFFSET_Z_FAST, s));

    const worldPos = new THREE.Vector3();
    carGroup.getWorldPosition(worldPos);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carGroup.quaternion);

    targetPos.copy(worldPos).add(offset.clone().applyQuaternion(carGroup.quaternion));
    targetLook.copy(worldPos).add(fwd.multiplyScalar(5));

    camera.position.lerp(targetPos, SMOOTH);
    camera.lookAt(camera.position.clone().lerp(targetLook, 1));
  }

  return { update };
}
