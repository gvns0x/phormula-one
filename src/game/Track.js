import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const KERB_W = 1.2;
const BARRIER_GAP = 10;
const BARRIER_H = 1.2;
const N_SAMPLES = 800;

const SECTION_WIDTHS = {
  1: 12, 2: 11, 3: 10, 4: 10, 5: 9, 6: 9, 7: 9, 8: 10,
  9: 11, 10: 10, 11: 9, 12: 8, 13: 9, 14: 8, 15: 8, 16: 9,
  17: 9, 18: 10, 19: 13,
};

const SECTION_MAP = [
  19, 19, 19, 19, 19,
  1, 1, 1,
  2, 2,
  3, 3,
  4, 4,
  5, 5, 5,
  6, 6,
  7,
  8, 8, 8, 8, 8,
  9, 9, 9, 9, 9, 9,
  10, 10,
  11, 11,
  12, 12,
  13, 13,
  14, 14,
  15, 15,
  16, 16,
  17, 17, 17, 17, 17,
  18, 18,
];

function V3(x, z) {
  return new THREE.Vector3(x, 0, z);
}

function sampleCenterline() {
  const cp = [
    // S19: Pit straight (north) + Start/Finish (curving east)
    V3(-195, 130),  V3(-192, 95),   V3(-188, 60),
    V3(-150, 15),   V3(-80, 5),
    // S1: Sainte Devote
    V3(-20, 14),    V3(22, 6),      V3(55, 0),
    // S2: Beau Rivage (long east straight)
    V3(130, -5),    V3(205, -8),
    // S3: Massenet
    V3(260, -5),    V3(300, 0),
    // S4: Casino
    V3(340, 8),     V3(368, 18),
    // S5: Casino Square (big right curve south)
    V3(392, 35),    V3(408, 58),    V3(415, 85),
    // S6: Mirabeau Haute
    V3(418, 115),   V3(419, 140),
    // S7: Mirabeau Bas
    V3(420, 168),
    // S8: Portier + Grand Hotel Hairpin
    V3(420, 195),   V3(418, 218),
    V3(414, 240),   V3(404, 258),   V3(385, 265),
    // S9: Hairpin exit + Tunnel (sweeping west)
    V3(368, 258),   V3(362, 240),
    V3(348, 218),   V3(325, 198),
    V3(295, 182),   V3(260, 170),
    // S10: Nouvelle Chicane
    V3(225, 162),   V3(195, 158),
    // S11: Chicane exit
    V3(165, 160),   V3(135, 156),
    // S12: Tabac
    V3(95, 152),    V3(52, 150),
    // S13: Piscine entry (chicane S-curves)
    V3(15, 155),    V3(-8, 170),
    // S14: Louis Chiron
    V3(4, 185),     V3(-14, 200),
    // S15: Pool exit
    V3(-35, 212),   V3(-58, 225),
    // S16
    V3(-80, 238),   V3(-105, 250),
    // S17: La Rascasse (tight right hairpin)
    V3(-130, 260),  V3(-158, 268),  V3(-180, 262),
    V3(-194, 248),  V3(-196, 228),
    // S18: Anthony Noghes (heading north)
    V3(-192, 200),  V3(-196, 168),
  ];

  const N_CTRL = cp.length;
  const curve = new THREE.CatmullRomCurve3(cp, true);
  curve.arcLengthDivisions = 800;

  const pts = [];
  const halfWidths = [];

  for (let i = 0; i < N_SAMPLES; i++) {
    const u = i / N_SAMPLES;
    pts.push(curve.getPointAt(u));
    const t = curve.getUtoTmapping(u);
    const idx = Math.min(Math.floor(t * N_CTRL), N_CTRL - 1);
    halfWidths.push(SECTION_WIDTHS[SECTION_MAP[idx]] / 2);
  }

  for (let pass = 0; pass < 12; pass++) {
    const temp = [...halfWidths];
    for (let i = 0; i < N_SAMPLES; i++) {
      const p = (i - 1 + N_SAMPLES) % N_SAMPLES;
      const n = (i + 1) % N_SAMPLES;
      halfWidths[i] = (temp[p] + temp[i] + temp[n]) / 3;
    }
  }

  const startTangent = curve.getTangentAt(0);
  return { pts, halfWidths, startTangent };
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
    const o = typeof offset === 'number' ? offset : offset[i];
    const w = typeof hw === 'number' ? hw : hw[i];
    const cx = p.x + r.x * o, cz = p.z + r.z * o;
    pos[i * 6] = cx - r.x * w;
    pos[i * 6 + 1] = y;
    pos[i * 6 + 2] = cz - r.z * w;
    pos[i * 6 + 3] = cx + r.x * w;
    pos[i * 6 + 4] = y;
    pos[i * 6 + 5] = cz + r.z * w;
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

function interpAt(target, pts, rights, tangents, dists, totalLen, halfWidths) {
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
        hw: halfWidths ? THREE.MathUtils.lerp(halfWidths[i], halfWidths[ni], t) : 5,
      };
    }
  }
  return {
    pos: pts[0].clone(), right: rights[0].clone(),
    tangent: tangents[0].clone(), hw: halfWidths ? halfWidths[0] : 5,
  };
}

function buildRacingLine(pts, rights, tangents, halfWidths) {
  const N = pts.length;
  const lineGroup = new THREE.Group();

  const curvature = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    curvature[i] = tangents[i].z * tangents[next].x - tangents[i].x * tangents[next].z;
  }

  const SCALE = 500;
  const MAX_FRAC = 0.75;
  const offset = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const raw = -curvature[i] * SCALE;
    const limit = halfWidths[i] * MAX_FRAC;
    offset[i] = Math.max(-limit, Math.min(limit, raw));
  }

  for (let pass = 0; pass < 25; pass++) {
    const temp = new Float32Array(offset);
    for (let i = 0; i < N; i++) {
      const p = (i - 1 + N) % N;
      const n = (i + 1) % N;
      offset[i] = (temp[p] + temp[i] + temp[n]) / 3;
    }
  }

  for (let i = 0; i < N; i++) {
    const limit = halfWidths[i] * MAX_FRAC;
    offset[i] = Math.max(-limit, Math.min(limit, offset[i]));
  }

  const ribbonGeom = buildRibbon(pts, rights, Array.from(offset), 0.4, 0.045);
  const ribbonMat = new THREE.MeshBasicMaterial({
    color: 0x00ffaa,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  lineGroup.add(new THREE.Mesh(ribbonGeom, ribbonMat));

  const smoothCurv = new Float32Array(N);
  for (let i = 0; i < N; i++) smoothCurv[i] = Math.abs(curvature[i]);
  for (let pass = 0; pass < 8; pass++) {
    const temp = new Float32Array(smoothCurv);
    for (let i = 0; i < N; i++) {
      const p = (i - 1 + N) % N;
      const n = (i + 1) % N;
      smoothCurv[i] = (temp[p] + temp[i] + temp[n]) / 3;
    }
  }

  const APEX_THRESHOLD = 0.002;
  const MIN_SPACING = 25;
  const apexIndices = [];
  for (let i = 0; i < N; i++) {
    const p = (i - 1 + N) % N;
    const n = (i + 1) % N;
    if (smoothCurv[i] > smoothCurv[p] && smoothCurv[i] > smoothCurv[n] && smoothCurv[i] > APEX_THRESHOLD) {
      if (apexIndices.length === 0 || i - apexIndices[apexIndices.length - 1] >= MIN_SPACING) {
        apexIndices.push(i);
      } else if (smoothCurv[i] > smoothCurv[apexIndices[apexIndices.length - 1]]) {
        apexIndices[apexIndices.length - 1] = i;
      }
    }
  }

  const apexGeom = new THREE.CircleGeometry(1.5, 16);
  apexGeom.rotateX(-Math.PI / 2);
  const apexMat = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const idx of apexIndices) {
    const marker = new THREE.Mesh(apexGeom, apexMat);
    marker.position.set(
      pts[idx].x + rights[idx].x * offset[idx],
      0.05,
      pts[idx].z + rights[idx].z * offset[idx]
    );
    lineGroup.add(marker);
  }

  lineGroup.visible = false;
  return lineGroup;
}

function createBarrierTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, 256, 5);
  ctx.fillRect(0, 59, 256, 5);
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PIRELLI', 64, 32);
  ctx.fillText('P ZERO', 192, 32);
  return new THREE.CanvasTexture(c);
}

export function createTrack(world) {
  const group = new THREE.Group();
  const { pts, halfWidths, startTangent } = sampleCenterline();
  const { tangents, rights } = getFrames(pts);
  const dists = cumDists(pts);
  const N = pts.length;
  const totalLen = dists[N - 1] + pts[0].distanceTo(pts[N - 1]);

  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const road = new THREE.Mesh(
    buildRibbon(pts, rights, 0, halfWidths, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 })
  );
  road.receiveShadow = true;
  group.add(road);

  for (const s of [-1, 1]) {
    const offsets = halfWidths.map(hw => s * (hw - 0.3));
    group.add(new THREE.Mesh(buildRibbon(pts, rights, offsets, 0.12, 0.03), whiteMat));
  }

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

  for (const s of [-1, 1]) {
    const kerbOffsets = halfWidths.map(hw => s * (hw + KERB_W / 2));
    const kg = buildRibbon(pts, rights, kerbOffsets, KERB_W / 2, 0.025);
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

  const numPerSide = Math.floor(totalLen / BARRIER_GAP);
  const barrierGeom = new THREE.BoxGeometry(0.8, BARRIER_H, 3.0);
  barrierGeom.translate(0, BARRIER_H / 2, 0);
  const barriers = new THREE.InstancedMesh(
    barrierGeom,
    new THREE.MeshStandardMaterial({ map: createBarrierTexture(), roughness: 0.5 }),
    numPerSide * 2
  );
  barriers.castShadow = true;
  barriers.receiveShadow = true;

  const barrierPhysMat = new CANNON.Material({ friction: 0.5, restitution: 0.3 });
  const barrierShape = new CANNON.Box(new CANNON.Vec3(0.4, BARRIER_H / 2, 1.5));

  const dummy = new THREE.Object3D();
  let bIdx = 0;
  for (let d = 0; d < totalLen && bIdx < numPerSide * 2; d += BARRIER_GAP) {
    const f = interpAt(d, pts, rights, tangents, dists, totalLen, halfWidths);
    const barrierDist = f.hw + KERB_W + 1.5;
    for (const s of [-1, 1]) {
      const bx = f.pos.x + f.right.x * s * barrierDist;
      const bz = f.pos.z + f.right.z * s * barrierDist;
      dummy.position.set(bx, 0, bz);
      dummy.lookAt(bx + f.tangent.x, 0, bz + f.tangent.z);
      dummy.updateMatrix();
      barriers.setMatrixAt(bIdx++, dummy.matrix);

      if (world) {
        const body = new CANNON.Body({ mass: 0, material: barrierPhysMat });
        body.addShape(barrierShape);
        body.position.set(bx, BARRIER_H / 2, bz);
        body.quaternion.setFromEuler(0, Math.atan2(f.tangent.x, f.tangent.z), 0);
        world.addBody(body);
      }
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  const startPt = pts[0];
  const startHW = halfWidths[0];
  const sf = new THREE.Mesh(
    new THREE.PlaneGeometry(startHW * 2, 1.5),
    whiteMat
  );
  sf.rotation.x = -Math.PI / 2;
  sf.rotation.y = Math.atan2(startTangent.x, startTangent.z);
  sf.position.set(startPt.x, 0.035, startPt.z);
  group.add(sf);

  const racingLine = buildRacingLine(pts, rights, tangents, halfWidths);
  group.add(racingLine);

  const startRotationY = Math.atan2(startTangent.x, startTangent.z);

  function setRacingLineVisible(v) {
    racingLine.visible = v;
  }

  function isOffTrack(x, z) {
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < N; i++) {
      const dx = x - pts[i].x;
      const dz = z - pts[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
    }
    const r = rights[bestIdx];
    const lateral = (x - pts[bestIdx].x) * r.x + (z - pts[bestIdx].z) * r.z;
    return Math.abs(lateral) > halfWidths[bestIdx] + KERB_W;
  }

  return {
    group,
    startPosition: new THREE.Vector3(startPt.x, 1, startPt.z),
    startRotationY,
    startTangent,
    isOffTrack,
    setRacingLineVisible,
    pts,
    halfWidths,
  };
}
