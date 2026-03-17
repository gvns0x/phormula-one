import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const PARK = { x: 110, z: 130, hw: 115, hd: 65 };
const KERB_W = 1.2;
const BARRIER_OFFSET = 1.5;
const CLEARANCE = 8;

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function pointInsideTrack(x, z, trackPts) {
  let inside = false;
  const N = trackPts.length;
  for (let i = 0, j = N - 1; i < N; j = i++) {
    const xi = trackPts[i].x, zi = trackPts[i].z;
    const xj = trackPts[j].x, zj = trackPts[j].z;
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
}

function tooCloseToTrack(x, z, trackPts, trackHW) {
  for (let i = 0; i < trackPts.length; i += 4) {
    const dx = x - trackPts[i].x, dz = z - trackPts[i].z;
    const minD = trackHW[i] + KERB_W + BARRIER_OFFSET + CLEARANCE;
    if (dx * dx + dz * dz < minD * minD) return true;
  }
  return false;
}

function inPark(x, z) {
  return Math.abs(x - PARK.x) < PARK.hw && Math.abs(z - PARK.z) < PARK.hd;
}

// --- Texture generation ---

const FACADE_STYLES = [
  { bg: [38, 38, 48], wins: ['#f5d98a', '#eef0dd', '#ffe8a0', '#f0d070'] },
  { bg: [30, 45, 60], wins: ['#aaddff', '#eef8ff', '#88ccee', '#bbddff'] },
  { bg: [55, 35, 25], wins: ['#f5d98a', '#ffcc66', '#eebb55', '#dda844'] },
  { bg: [25, 25, 32], wins: ['#ffffff', '#eef0ff', '#ddddee', '#ccccdd'] },
];

function createWindowTexture(seed, styleIdx) {
  const style = FACADE_STYLES[styleIdx % FACADE_STYLES.length];
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const rng = seeded(seed);

  const [br, bg, bb] = style.bg;
  ctx.fillStyle = `rgb(${br + rng() * 15 | 0},${bg + rng() * 15 | 0},${bb + rng() * 15 | 0})`;
  ctx.fillRect(0, 0, size, size);

  for (let y = 3; y < size - 4; y += 6) {
    for (let x = 3; x < size - 3; x += 7) {
      if (rng() < 0.72) {
        ctx.fillStyle = style.wins[rng() * style.wins.length | 0];
        ctx.globalAlpha = 0.45 + rng() * 0.55;
        ctx.fillRect(x, y, 3, 4);
        ctx.globalAlpha = 1;
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// --- Buildings ---

function buildBuildings(group, rng, trackPts, trackHW) {
  const textures = [];
  for (let s = 0; s < FACADE_STYLES.length; s++) {
    textures.push(createWindowTexture(200 + s * 53, s));
    textures.push(createWindowTexture(400 + s * 71, s));
  }

  const candidates = [];
  const step = 28;

  for (let x = -500; x <= 550; x += step) {
    for (let z = -250; z <= 450; z += step) {
      const jx = x + (rng() - 0.5) * step * 0.7;
      const jz = z + (rng() - 0.5) * step * 0.7;
      if (tooCloseToTrack(jx, jz, trackPts, trackHW)) continue;
      if (pointInsideTrack(jx, jz, trackPts)) continue;

      const dt = distToNearestTrackPt(jx, jz, trackPts);
      let h, w, d;
      if (dt < 55) {
        h = 25 + rng() * 35; w = 8 + rng() * 8; d = 8 + rng() * 8;
      } else if (dt < 120) {
        h = 40 + rng() * 60; w = 10 + rng() * 12; d = 10 + rng() * 12;
      } else {
        h = 50 + rng() * 70; w = 12 + rng() * 16; d = 12 + rng() * 16;
      }

      const r = rng();
      let type;
      if (h > 60 && r < 0.2) type = 'setback';
      else if (r < 0.4) type = 'glass';
      else if (h < 40 && r > 0.7) type = 'brownstone';
      else type = 'concrete';

      const styleMap = { concrete: 0, glass: 1, brownstone: 2, setback: 3 };
      const texIdx = styleMap[type] * 2 + (rng() > 0.5 ? 1 : 0);

      candidates.push({ x: jx, z: jz, h, w, d, type, texIdx });
    }
  }

  renderBoxBuildings(group, candidates, textures, rng);
  renderSetbackBuildings(group, candidates, textures, rng);
  renderSpires(group, candidates, rng);
}

function distToNearestTrackPt(x, z, trackPts) {
  let min = Infinity;
  for (let i = 0; i < trackPts.length; i += 8) {
    const dx = x - trackPts[i].x, dz = z - trackPts[i].z;
    const d2 = dx * dx + dz * dz;
    if (d2 < min) min = d2;
  }
  return Math.sqrt(min);
}

function renderBoxBuildings(group, candidates, textures, rng) {
  const boxCandidates = candidates.filter(c => c.type !== 'setback');
  const buckets = Array.from({ length: textures.length }, () => []);
  for (const b of boxCandidates) buckets[b.texIdx].push(b);

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0);
  const dummy = new THREE.Object3D();

  for (let t = 0; t < textures.length; t++) {
    if (!buckets[t].length) continue;
    const isGlass = t >= 2 && t < 4;
    const mat = new THREE.MeshStandardMaterial({
      map: textures[t],
      roughness: isGlass ? 0.3 : 0.85,
      metalness: isGlass ? 0.4 : 0,
    });
    const mesh = new THREE.InstancedMesh(unitBox, mat, buckets[t].length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    for (let i = 0; i < buckets[t].length; i++) {
      const b = buckets[t][i];
      dummy.position.set(b.x, 0, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.y = rng() * 0.3 - 0.15;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
}

function renderSetbackBuildings(group, candidates, textures, rng) {
  const setbacks = candidates.filter(c => c.type === 'setback');
  if (!setbacks.length) return;

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0);
  const dummy = new THREE.Object3D();

  const baseMat = new THREE.MeshStandardMaterial({ map: textures[6], roughness: 0.85 });
  const towerMat = new THREE.MeshStandardMaterial({ map: textures[7], roughness: 0.85 });

  const bases = new THREE.InstancedMesh(unitBox, baseMat, setbacks.length);
  const towers = new THREE.InstancedMesh(unitBox, towerMat, setbacks.length);
  bases.castShadow = true; bases.receiveShadow = true;
  towers.castShadow = true; towers.receiveShadow = true;

  for (let i = 0; i < setbacks.length; i++) {
    const b = setbacks[i];
    const baseH = b.h * 0.35;
    const rot = rng() * 0.3 - 0.15;

    dummy.position.set(b.x, 0, b.z);
    dummy.scale.set(b.w * 1.3, baseH, b.d * 1.3);
    dummy.rotation.y = rot;
    dummy.updateMatrix();
    bases.setMatrixAt(i, dummy.matrix);

    dummy.position.set(b.x, baseH, b.z);
    dummy.scale.set(b.w * 0.6, b.h * 0.65, b.d * 0.6);
    dummy.rotation.y = rot;
    dummy.updateMatrix();
    towers.setMatrixAt(i, dummy.matrix);
  }
  bases.instanceMatrix.needsUpdate = true;
  towers.instanceMatrix.needsUpdate = true;
  group.add(bases);
  group.add(towers);
}

function renderSpires(group, candidates, rng) {
  const spireCandidates = candidates.filter(c => c.h > 70 && rng() < 0.18);
  if (!spireCandidates.length) return;

  const coneG = new THREE.ConeGeometry(1, 1, 4);
  coneG.translate(0, 0.5, 0);
  const spireMat = new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.6, roughness: 0.3 });
  const mesh = new THREE.InstancedMesh(coneG, spireMat, spireCandidates.length);
  mesh.castShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < spireCandidates.length; i++) {
    const b = spireCandidates[i];
    dummy.position.set(b.x, b.h, b.z);
    dummy.scale.set(1.5, 15 + rng() * 10, 1.5);
    dummy.rotation.y = 0;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

// --- Park ---

function buildPark(group, rng, trackPts, trackHW) {
  const parkGrass = new THREE.Mesh(
    new THREE.PlaneGeometry(PARK.hw * 2, PARK.hd * 2),
    new THREE.MeshStandardMaterial({ color: 0x4a8c38, roughness: 1 })
  );
  parkGrass.rotation.x = -Math.PI / 2;
  parkGrass.position.set(PARK.x, 0.005, PARK.z);
  parkGrass.receiveShadow = true;
  group.add(parkGrass);

  const pathMat = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.9 });
  for (const [pw, pd, ox, oz] of [
    [PARK.hw * 1.7, 2, 0, 0],
    [2, PARK.hd * 1.5, 0, 0],
    [PARK.hw * 1.2, 1.8, -15, -20],
    [1.8, PARK.hd * 1.0, 30, 10],
  ]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(PARK.x + ox, 0.012, PARK.z + oz);
    p.receiveShadow = true;
    group.add(p);
  }

  const pondRx = 28, pondRz = 16;
  const pondGeom = new THREE.CircleGeometry(1, 48);
  pondGeom.rotateX(-Math.PI / 2);
  const pond = new THREE.Mesh(pondGeom, new THREE.MeshStandardMaterial({
    color: 0x2277aa, roughness: 0.05, metalness: 0.35,
    transparent: true, opacity: 0.82,
  }));
  pond.scale.set(pondRx, 1, pondRz);
  pond.position.set(PARK.x, 0.018, PARK.z);
  pond.receiveShadow = true;
  group.add(pond);

  const shoreGeom = new THREE.RingGeometry(0.92, 1.06, 48);
  shoreGeom.rotateX(-Math.PI / 2);
  const shore = new THREE.Mesh(shoreGeom,
    new THREE.MeshStandardMaterial({ color: 0x7a6644, roughness: 0.9 }));
  shore.scale.set(pondRx, 1, pondRz);
  shore.position.set(PARK.x, 0.022, PARK.z);
  group.add(shore);

  buildTrees(group, rng, pondRx, pondRz, trackPts, trackHW);
}

function buildTrees(group, rng, pondRx, pondRz, trackPts, trackHW) {
  const positions = [];

  for (let i = 0; i < 130; i++) {
    const tx = PARK.x + (rng() - 0.5) * PARK.hw * 1.85;
    const tz = PARK.z + (rng() - 0.5) * PARK.hd * 1.85;
    if (!inPark(tx, tz)) continue;
    if (tooCloseToTrack(tx, tz, trackPts, trackHW)) continue;
    const px = (tx - PARK.x) / (pondRx + 4), pz = (tz - PARK.z) / (pondRz + 4);
    if (px * px + pz * pz < 1) continue;
    positions.push({ x: tx, z: tz });
  }

  for (let i = 0; i < 60; i++) {
    const tx = -400 + rng() * 950;
    const tz = -200 + rng() * 600;
    if (tooCloseToTrack(tx, tz, trackPts, trackHW)) continue;
    if (pointInsideTrack(tx, tz, trackPts)) continue;
    const dt = distToNearestTrackPt(tx, tz, trackPts);
    if (dt > 50) continue;
    positions.push({ x: tx, z: tz });
  }

  if (!positions.length) return;

  const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 2.5, 6);
  trunkG.translate(0, 1.25, 0);
  const canopyG = new THREE.ConeGeometry(3, 6.5, 8);
  canopyG.translate(0, 6, 0);

  const greens = [0x2d6b1e, 0x3a7d2c, 0x1f5a14, 0x448833];

  const trunkMesh = new THREE.InstancedMesh(trunkG,
    new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 }), positions.length);
  trunkMesh.castShadow = true;

  const canopyMesh = new THREE.InstancedMesh(canopyG,
    new THREE.MeshStandardMaterial({ color: greens[0], roughness: 0.8 }), positions.length);
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < positions.length; i++) {
    const t = positions[i];
    const s = 0.7 + rng() * 0.7;
    dummy.position.set(t.x, 0, t.z);
    dummy.scale.set(s, s, s);
    dummy.rotation.y = rng() * Math.PI * 2;
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    canopyMesh.setMatrixAt(i, dummy.matrix);
    canopyMesh.setColorAt(i, color.setHex(greens[rng() * greens.length | 0]));
  }
  trunkMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceColor.needsUpdate = true;

  group.add(trunkMesh);
  group.add(canopyMesh);
}

// --- Bridge ---

function buildBridge(group, world) {
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x666672, roughness: 0.7 });
  const pillarW = 3, pillarD = 3, pillarH = 14;
  const deckY = pillarH;
  const deckThick = 1.5;

  const cx = 310, cz = 195;
  const span = 40;
  const northZ = cz - span / 2;
  const southZ = cz + span / 2;

  for (const pz of [northZ, southZ]) {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(pillarW, pillarH, pillarD),
      bridgeMat
    );
    pillar.position.set(cx, pillarH / 2, pz);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);

    if (world) {
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(pillarW / 2, pillarH / 2, pillarD / 2)));
      body.position.set(cx, pillarH / 2, pz);
      world.addBody(body);
    }
  }

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(8, deckThick, span + pillarD),
    bridgeMat
  );
  deck.position.set(cx, deckY + deckThick / 2, cz);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const railMat = new THREE.MeshStandardMaterial({ color: 0x555560, roughness: 0.6 });
  for (const rx of [-3.8, 3.8]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.2, span + pillarD),
      railMat
    );
    rail.position.set(cx + rx, deckY + deckThick + 0.6, cz);
    rail.castShadow = true;
    group.add(rail);
  }
}

// --- Main export ---

export function createEnvironment(trackPts, trackHW, world) {
  const group = new THREE.Group();
  const rng = seeded(42);
  buildBuildings(group, rng, trackPts, trackHW);
  buildPark(group, rng, trackPts, trackHW);
  buildBridge(group, world);
  return group;
}
