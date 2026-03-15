import * as THREE from 'three';

const ROAD_HW = 7;
const KERB_W = 1.2;
const STRAIGHT = 120;
const CURVE_R = 50;
const BARRIER_GAP = 10;
const BARRIER_H = 1.0;
const BARRIER_DIST = ROAD_HW + KERB_W + 1.5;

function sampleCenterline() {
  const pts = [];
  const hS = STRAIGHT / 2;
  const R = CURVE_R;
  const ss = 150, sc = 200;

  for (let i = 0; i <= ss; i++)
    pts.push(new THREE.Vector3(R, 0, -hS + (STRAIGHT * i) / ss));
  for (let i = 1; i <= sc; i++) {
    const a = (Math.PI * i) / sc;
    pts.push(new THREE.Vector3(R * Math.cos(a), 0, hS + R * Math.sin(a)));
  }
  for (let i = 1; i <= ss; i++)
    pts.push(new THREE.Vector3(-R, 0, hS - (STRAIGHT * i) / ss));
  for (let i = 1; i < sc; i++) {
    const a = Math.PI + (Math.PI * i) / sc;
    pts.push(new THREE.Vector3(R * Math.cos(a), 0, -hS + R * Math.sin(a)));
  }
  return pts;
}

function getFrames(pts) {
  const N = pts.length;
  const up = new THREE.Vector3(0, 1, 0);
  const tangents = [], rights = [];
  for (let i = 0; i < N; i++) {
    const t = new THREE.Vector3()
      .subVectors(pts[(i + 1) % N], pts[(i - 1 + N) % N])
      .normalize();
    tangents.push(t);
    rights.push(new THREE.Vector3().crossVectors(up, t).normalize());
  }
  return { tangents, rights };
}

function cumDists(pts) {
  const d = [0];
  for (let i = 1; i < pts.length; i++)
    d.push(d[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return d;
}

function buildRibbon(pts, rights, offset, hw, y) {
  const N = pts.length;
  const pos = new Float32Array(N * 6);
  const idx = [];
  for (let i = 0; i < N; i++) {
    const p = pts[i], r = rights[i];
    const cx = p.x + r.x * offset, cz = p.z + r.z * offset;
    pos[i * 6] = cx - r.x * hw;
    pos[i * 6 + 1] = y;
    pos[i * 6 + 2] = cz - r.z * hw;
    pos[i * 6 + 3] = cx + r.x * hw;
    pos[i * 6 + 4] = y;
    pos[i * 6 + 5] = cz + r.z * hw;
  }
  for (let i = 0; i < N; i++) {
    const n = (i + 1) % N, a = i * 2, b = n * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function interpAt(target, pts, rights, tangents, dists, totalLen) {
  const N = pts.length;
  const d = ((target % totalLen) + totalLen) % totalLen;
  for (let i = 0; i < N; i++) {
    const ni = (i + 1) % N;
    const d0 = dists[i];
    const d1 = ni === 0 ? totalLen : dists[ni];
    if (d >= d0 && d < d1) {
      const t = (d - d0) / (d1 - d0);
      return {
        pos: new THREE.Vector3().lerpVectors(pts[i], pts[ni], t),
        right: new THREE.Vector3().lerpVectors(rights[i], rights[ni], t).normalize(),
        tangent: new THREE.Vector3().lerpVectors(tangents[i], tangents[ni], t).normalize(),
      };
    }
  }
  return { pos: pts[0].clone(), right: rights[0].clone(), tangent: tangents[0].clone() };
}

export function createTrack() {
  const group = new THREE.Group();
  const pts = sampleCenterline();
  const { tangents, rights } = getFrames(pts);
  const dists = cumDists(pts);
  const N = pts.length;
  const totalLen = dists[N - 1] + pts[0].distanceTo(pts[N - 1]);

  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Road surface
  const road = new THREE.Mesh(
    buildRibbon(pts, rights, 0, ROAD_HW, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 })
  );
  road.receiveShadow = true;
  group.add(road);

  // Solid edge lines
  for (const s of [-1, 1])
    group.add(new THREE.Mesh(buildRibbon(pts, rights, s * (ROAD_HW - 0.3), 0.12, 0.03), whiteMat));

  // Dashed center line
  const dashCycle = 7, dashOn = 3, dlHW = 0.1;
  const dPos = [], dIdx = [];
  let vi = 0, prevDash = false;
  for (let i = 0; i < N; i++) {
    const inDash = (dists[i] % dashCycle) < dashOn;
    if (inDash) {
      const p = pts[i], r = rights[i];
      dPos.push(p.x - r.x * dlHW, 0.03, p.z - r.z * dlHW);
      dPos.push(p.x + r.x * dlHW, 0.03, p.z + r.z * dlHW);
      if (prevDash) {
        const a = vi - 2, b = vi;
        dIdx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      vi += 2;
    }
    prevDash = inDash;
  }
  if (dPos.length) {
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dPos, 3));
    dg.setIndex(dIdx);
    dg.computeVertexNormals();
    group.add(new THREE.Mesh(dg, whiteMat));
  }

  // Red/white kerbs
  for (const s of [-1, 1]) {
    const kg = buildRibbon(pts, rights, s * (ROAD_HW + KERB_W / 2), KERB_W / 2, 0.025);
    const colors = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const isRed = Math.floor(dists[i] / 2) % 2 === 0;
      const cr = isRed ? 0.85 : 1, cg = isRed ? 0.1 : 1, cb = isRed ? 0.1 : 1;
      colors[i * 6] = cr;     colors[i * 6 + 1] = cg; colors[i * 6 + 2] = cb;
      colors[i * 6 + 3] = cr; colors[i * 6 + 4] = cg; colors[i * 6 + 5] = cb;
    }
    kg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const kerb = new THREE.Mesh(kg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    kerb.receiveShadow = true;
    group.add(kerb);
  }

  // Concrete barriers (InstancedMesh)
  const numPerSide = Math.floor(totalLen / BARRIER_GAP);
  const barrierGeom = new THREE.BoxGeometry(0.5, BARRIER_H, 2.5);
  barrierGeom.translate(0, BARRIER_H / 2, 0);
  const barriers = new THREE.InstancedMesh(
    barrierGeom,
    new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.4 }),
    numPerSide * 2
  );
  barriers.castShadow = true;
  barriers.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let bIdx = 0;
  for (let d = 0; d < totalLen && bIdx < numPerSide * 2; d += BARRIER_GAP) {
    const f = interpAt(d, pts, rights, tangents, dists, totalLen);
    for (const s of [-1, 1]) {
      dummy.position.set(
        f.pos.x + f.right.x * s * BARRIER_DIST,
        0,
        f.pos.z + f.right.z * s * BARRIER_DIST
      );
      dummy.lookAt(
        dummy.position.x + f.tangent.x,
        0,
        dummy.position.z + f.tangent.z
      );
      dummy.updateMatrix();
      barriers.setMatrixAt(bIdx++, dummy.matrix);
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  // Start / finish stripe
  const sf = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HW * 2, 1.5),
    whiteMat
  );
  sf.rotation.x = -Math.PI / 2;
  sf.position.set(CURVE_R, 0.035, 0);
  group.add(sf);

  return { group, startPosition: new THREE.Vector3(CURVE_R, 1, 0) };
}
