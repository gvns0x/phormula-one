import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const KERB_W = 1.2;
const BARRIER_GAP = 2.8;
const BARRIER_H = 1.2;
const N_SAMPLES = 800;

function V3(x, z) {
  return new THREE.Vector3(x, 0, z);
}

function sampleCenterline(trackConfig) {
  const cp = trackConfig.centerline.map(([x, z]) => V3(x, z));
  const sectionWidths = trackConfig.sectionWidths;
  const sectionMap = trackConfig.sectionMap;

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
    const secIdx = idx < sectionMap.length ? idx : sectionMap.length - 1;
    halfWidths.push((sectionWidths[sectionMap[secIdx]] ?? 10) / 2);
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

function computeRacingLineOffsets(tangents, halfWidths, N) {
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

  return { offset, curvature };
}

function buildRacingLine(pts, rights, tangents, halfWidths) {
  const N = pts.length;
  const lineGroup = new THREE.Group();

  const { offset, curvature } = computeRacingLineOffsets(tangents, halfWidths, N);

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
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#FBDF45';
  ctx.fillRect(0, 0, c.width, c.height);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;

  const img = new Image();
  img.src = '/textures/pirelli-barrier.png';
  img.onload = () => {
    ctx.fillStyle = '#FBDF45';
    ctx.fillRect(0, 0, c.width, c.height);

    const maxLogoWidth = c.width * 0.6;
    const logoWidth = maxLogoWidth;
    const logoHeight = (img.height / img.width) * logoWidth;
    const x = (c.width - logoWidth) / 2;
    const y = (c.height - logoHeight) / 2;
    ctx.drawImage(img, x, y, logoWidth, logoHeight);

    tex.needsUpdate = true;
  };

  return tex;
}

function makeNumberSprite(num) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), size / 2, size / 2);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.04, 0.04, 1);
  return sprite;
}

function buildCornerLabels(pts, rights, halfWidths, sectionMap) {
  const labelsGroup = new THREE.Group();
  const N = pts.length;
  const N_CTRL = sectionMap.length;
  const curve = new THREE.CatmullRomCurve3(pts, true);
  curve.arcLengthDivisions = 400;

  const sectionSamples = {};
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const t = curve.getUtoTmapping(u);
    const idx = Math.min(Math.floor(t * N_CTRL), N_CTRL - 1);
    const sec = sectionMap[idx];
    if (!sectionSamples[sec]) sectionSamples[sec] = [];
    sectionSamples[sec].push(i);
  }

  const maxSection = Math.max(...sectionMap);
  for (let sec = 1; sec <= maxSection; sec++) {
    const samples = sectionSamples[sec];
    if (!samples || samples.length === 0) continue;
    const midIdx = samples[Math.floor(samples.length / 2)];
    const p = pts[midIdx];
    const r = rights[midIdx];
    const offset = halfWidths[midIdx] + KERB_W + 6;
    const sprite = makeNumberSprite(sec);
    sprite.position.set(p.x + r.x * offset, 8, p.z + r.z * offset);
    labelsGroup.add(sprite);
  }

  labelsGroup.visible = false;
  return labelsGroup;
}

export function createTrack(world, trackConfig) {
  const group = new THREE.Group();
  const { pts, halfWidths, startTangent } = sampleCenterline(trackConfig);
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
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: createBarrierTexture(),
      roughness: 0.5,
    }),
    numPerSide * 2
  );
  barriers.castShadow = true;
  barriers.receiveShadow = true;

  const barrierPhysMat = new CANNON.Material({ friction: 0.5, restitution: 0.8 });
  const barrierShape = new CANNON.Box(new CANNON.Vec3(0.4, BARRIER_H / 2, 1.5));

  const dummy = new THREE.Object3D();
  let bIdx = 0;
  for (let d = 0; d < totalLen && bIdx < numPerSide * 2; d += BARRIER_GAP) {
    const f = interpAt(d, pts, rights, tangents, dists, totalLen, halfWidths);
    const barrierDist = f.hw + KERB_W + 1.5;
    for (const s of [-1, 1]) {
      const bx = f.pos.x + f.right.x * s * barrierDist;
      const bz = f.pos.z + f.right.z * s * barrierDist;

      let overlaps = false;
      for (let i = 0; i < N; i++) {
        const dx = bx - pts[i].x;
        const dz = bz - pts[i].z;
        if (dx * dx + dz * dz < (halfWidths[i] + KERB_W) * (halfWidths[i] + KERB_W)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

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
  barriers.count = bIdx;
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

  const { offset: rlOffsets } = computeRacingLineOffsets(tangents, halfWidths, N);
  const racingLinePts = pts.map((p, i) => ({
    x: p.x + rights[i].x * rlOffsets[i],
    z: p.z + rights[i].z * rlOffsets[i],
  }));

  const cornerLabels = buildCornerLabels(pts, rights, halfWidths, trackConfig.sectionMap);
  group.add(cornerLabels);

  const startRotationY = Math.atan2(startTangent.x, startTangent.z);

  // DRS zone
  const drsStart = trackConfig.drsZone.start;
  const drsEnd = trackConfig.drsZone.end;
  const drsStartTarget = V3(drsStart[0], drsStart[1]);
  const drsEndTarget = V3(drsEnd[0], drsEnd[1]);
  let drsStartIdx = 0, drsEndIdx = 0;
  let drsStartBest = Infinity, drsEndBest = Infinity;
  for (let i = 0; i < N; i++) {
    const d1 = (pts[i].x - drsStartTarget.x) ** 2 + (pts[i].z - drsStartTarget.z) ** 2;
    const d2 = (pts[i].x - drsEndTarget.x) ** 2 + (pts[i].z - drsEndTarget.z) ** 2;
    if (d1 < drsStartBest) { drsStartBest = d1; drsStartIdx = i; }
    if (d2 < drsEndBest) { drsEndBest = d2; drsEndIdx = i; }
  }

  const drsGreenMat = new THREE.MeshBasicMaterial({
    color: 0x00cc44,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const idx of [drsStartIdx, drsEndIdx]) {
    const p = pts[idx], r = rights[idx], hw = halfWidths[idx];
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, 1.2),
      drsGreenMat
    );
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.y = Math.atan2(tangents[idx].x, tangents[idx].z);
    strip.position.set(p.x, 0.04, p.z);
    group.add(strip);
  }

  function setRacingLineVisible(v) {
    racingLine.visible = v;
  }

  function setCornerLabelsVisible(v) {
    cornerLabels.visible = v;
  }

  function getNearestIndex(x, z) {
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < N; i++) {
      const dx = x - pts[i].x;
      const dz = z - pts[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
    }
    return bestIdx;
  }

  function isOffTrack(x, z) {
    const bestIdx = getNearestIndex(x, z);
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
    setCornerLabelsVisible,
    getNearestIndex,
    drsStartIdx,
    drsEndIdx,
    pts,
    halfWidths,
    racingLinePts,
  };
}
