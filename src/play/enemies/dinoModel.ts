import * as THREE from "three";
import type { DinoKind, GoblinRig } from "./goblinModel.ts";

/**
 * Organic theropod builds — silhouette and palette from SNES / film JP,
 * smooth volumes instead of chunky boxes. Shared buffers across the wave.
 */
const GEO = {
  torso: new THREE.CapsuleGeometry(0.2, 0.55, 6, 14),
  chest: new THREE.SphereGeometry(0.26, 16, 12),
  belly: new THREE.SphereGeometry(0.2, 14, 10),
  hip: new THREE.SphereGeometry(0.24, 14, 10),
  neck: new THREE.CapsuleGeometry(0.07, 0.28, 4, 10),
  skull: new THREE.SphereGeometry(0.16, 18, 14),
  snout: new THREE.CapsuleGeometry(0.06, 0.22, 4, 10),
  jaw: new THREE.CapsuleGeometry(0.045, 0.18, 3, 8),
  tooth: new THREE.ConeGeometry(0.012, 0.055, 5),
  eye: new THREE.SphereGeometry(0.028, 12, 10),
  lid: new THREE.SphereGeometry(0.032, 10, 8),
  brow: new THREE.SphereGeometry(0.04, 8, 6),
  thigh: new THREE.CapsuleGeometry(0.09, 0.28, 4, 10),
  knee: new THREE.SphereGeometry(0.07, 10, 8),
  shin: new THREE.CapsuleGeometry(0.055, 0.26, 4, 8),
  ankle: new THREE.SphereGeometry(0.045, 8, 6),
  foot: new THREE.CapsuleGeometry(0.04, 0.14, 3, 8),
  toe: new THREE.ConeGeometry(0.02, 0.1, 5),
  sickle: new THREE.ConeGeometry(0.028, 0.2, 6),
  upperArm: new THREE.CapsuleGeometry(0.035, 0.12, 3, 8),
  foreArm: new THREE.CapsuleGeometry(0.028, 0.1, 3, 6),
  hand: new THREE.SphereGeometry(0.035, 8, 6),
  claw: new THREE.ConeGeometry(0.012, 0.07, 4),
  tail: new THREE.CapsuleGeometry(0.08, 0.28, 4, 10),
  stripe: new THREE.CapsuleGeometry(0.02, 0.22, 2, 6),
  crest: new THREE.SphereGeometry(0.08, 10, 8),
  frill: new THREE.CircleGeometry(0.28, 16),
  ridge: new THREE.SphereGeometry(0.04, 8, 6),
  nostril: new THREE.SphereGeometry(0.015, 6, 5),
};

const MAT = {
  raptor: new THREE.MeshStandardMaterial({ color: "#9a7a42", roughness: 0.72, metalness: 0.05 }),
  raptorDark: new THREE.MeshStandardMaterial({ color: "#4a3418", roughness: 0.78 }),
  raptorBelly: new THREE.MeshStandardMaterial({ color: "#d8c490", roughness: 0.65 }),
  raptorStripe: new THREE.MeshStandardMaterial({ color: "#2a1c0c", roughness: 0.8 }),
  dilo: new THREE.MeshStandardMaterial({ color: "#6cb038", roughness: 0.7, metalness: 0.04 }),
  diloDark: new THREE.MeshStandardMaterial({ color: "#2e6018", roughness: 0.75 }),
  diloBelly: new THREE.MeshStandardMaterial({ color: "#c8e070", roughness: 0.62 }),
  diloCrest: new THREE.MeshStandardMaterial({ color: "#e8a020", roughness: 0.55, emissive: "#402000", emissiveIntensity: 0.15 }),
  diloFrill: new THREE.MeshStandardMaterial({ color: "#e84828", roughness: 0.55, side: THREE.DoubleSide }),
  diloFrillIn: new THREE.MeshStandardMaterial({ color: "#f2d060", roughness: 0.5, side: THREE.DoubleSide }),
  trex: new THREE.MeshStandardMaterial({ color: "#a86a38", roughness: 0.74, metalness: 0.04 }),
  trexDark: new THREE.MeshStandardMaterial({ color: "#5a3418", roughness: 0.8 }),
  trexBelly: new THREE.MeshStandardMaterial({ color: "#d4b078", roughness: 0.65 }),
  claw: new THREE.MeshStandardMaterial({ color: "#1a1410", roughness: 0.4, metalness: 0.15 }),
  tooth: new THREE.MeshStandardMaterial({ color: "#f0ebe0", roughness: 0.35 }),
  gum: new THREE.MeshStandardMaterial({ color: "#6a3028", roughness: 0.7 }),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function eyeMat(emissive: string) {
  return new THREE.MeshStandardMaterial({
    color: "#0a0604",
    emissive,
    emissiveIntensity: 2.8,
    roughness: 0.25,
    metalness: 0.1,
  });
}

function addLeg(
  body: THREE.Group,
  side: number,
  skin: THREE.Material,
  dark: THREE.Material,
  hipY: number,
  thick: number,
  sickle: boolean,
): THREE.Group {
  const hip = new THREE.Group();
  hip.position.set(0.14 * side * thick, hipY, 0.02);
  body.add(hip);

  const thigh = mesh(GEO.thigh, dark, 0, -0.18, 0.06);
  thigh.scale.set(thick, 1, thick * 1.05);
  thigh.rotation.x = -0.7;
  hip.add(thigh);

  const knee = mesh(GEO.knee, skin, 0, -0.36, -0.02);
  knee.scale.setScalar(0.85 * thick);
  hip.add(knee);

  const shin = mesh(GEO.shin, skin, 0, -0.52, -0.12);
  shin.scale.set(thick * 0.9, 1, thick);
  shin.rotation.x = 1.05;
  hip.add(shin);

  hip.add(mesh(GEO.ankle, dark, 0, -0.62, -0.22));

  const foot = mesh(GEO.foot, dark, 0, -0.64, -0.3);
  foot.rotation.x = Math.PI / 2;
  foot.scale.set(thick, 1, 1);
  hip.add(foot);

  for (let i = -1; i <= 1; i++) {
    const toe = mesh(GEO.toe, MAT.claw, i * 0.032 * thick, -0.64, -0.42);
    toe.rotation.x = Math.PI / 2;
    hip.add(toe);
  }
  if (sickle) {
    const claw = mesh(GEO.sickle, MAT.claw, 0.045 * side, -0.4, -0.04);
    claw.rotation.set(-1.2, 0, side * 0.2);
    hip.add(claw);
  }
  return hip;
}

function addArm(torso: THREE.Group, side: number, skin: THREE.Material, scale: number) {
  const arm = new THREE.Group();
  arm.position.set(0.2 * side, 0.05, -0.35);
  arm.scale.setScalar(scale);
  const upper = mesh(GEO.upperArm, skin, 0, -0.06, -0.02);
  upper.rotation.x = 0.75;
  arm.add(upper);
  const fore = mesh(GEO.foreArm, skin, 0, -0.16, -0.06);
  fore.rotation.x = 0.4;
  arm.add(fore);
  arm.add(mesh(GEO.hand, skin, 0, -0.22, -0.08));
  for (const dx of [-0.02, 0.02]) {
    const c = mesh(GEO.claw, MAT.claw, dx, -0.26, -0.1);
    c.rotation.x = 2.1;
    arm.add(c);
  }
  torso.add(arm);
  return arm;
}

function addTail(torso: THREE.Group, dark: THREE.Material, skin: THREE.Material, thick: number) {
  const segs = [
    { z: 0.4, y: 0.02, s: 1.15 * thick, mat: dark, pitch: 1.2 },
    { z: 0.68, y: 0.1, s: 0.88 * thick, mat: skin, pitch: 1.15 },
    { z: 0.94, y: 0.18, s: 0.62 * thick, mat: dark, pitch: 1.1 },
    { z: 1.14, y: 0.26, s: 0.4 * thick, mat: skin, pitch: 1.05 },
    { z: 1.28, y: 0.32, s: 0.24 * thick, mat: dark, pitch: 1.0 },
  ];
  for (const seg of segs) {
    const t = mesh(GEO.tail, seg.mat, 0, seg.y, seg.z);
    t.rotation.x = seg.pitch;
    t.scale.setScalar(seg.s);
    torso.add(t);
  }
}

function addJaw(head: THREE.Group, snoutLen: number) {
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.06, -0.05);
  head.add(jaw);
  const bone = mesh(GEO.jaw, MAT.gum, 0, 0, -0.12 * snoutLen);
  bone.rotation.x = Math.PI / 2;
  bone.scale.set(0.95, snoutLen, 0.7);
  jaw.add(bone);
  for (let i = 0; i < 6; i++) {
    const tooth = mesh(GEO.tooth, MAT.tooth, -0.04 + i * 0.016, 0.025, -0.08 - i * 0.028 * snoutLen);
    tooth.rotation.x = Math.PI;
    jaw.add(tooth);
  }
  return jaw;
}

interface BuildOpts {
  skin: THREE.Material;
  dark: THREE.Material;
  belly: THREE.Material;
  eye: string;
  hipY: number;
  bodyScale: [number, number, number];
  headScale: number;
  snout: number;
  neckLift: number;
  armScale: number;
  legThick: number;
  tailThick: number;
  sickle: boolean;
}

function buildTheropod(opts: BuildOpts): GoblinRig {
  const eyes = eyeMat(opts.eye);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = opts.hipY;
  torso.scale.set(...opts.bodyScale);
  body.add(torso);

  const spine = mesh(GEO.torso, opts.skin, 0, 0.05, -0.1);
  spine.rotation.x = Math.PI / 2;
  spine.scale.set(1.05, 1.25, 0.9);
  torso.add(spine);

  const chest = mesh(GEO.chest, opts.skin, 0, 0.08, -0.48);
  chest.scale.set(0.95, 0.85, 1.1);
  torso.add(chest);

  const hips = mesh(GEO.hip, opts.dark, 0, -0.02, 0.16);
  hips.scale.set(1.15, 0.85, 1);
  torso.add(hips);

  const belly = mesh(GEO.belly, opts.belly, 0, -0.1, -0.12);
  belly.scale.set(0.95, 0.6, 1.4);
  torso.add(belly);

  const neck = mesh(GEO.neck, opts.skin, 0, 0.2 + opts.neckLift * 0.15, -0.58);
  neck.rotation.x = -0.85 + opts.neckLift;
  neck.scale.set(1.05, 1.1, 1);
  torso.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.42 + opts.neckLift * 0.4, -0.8);
  head.scale.setScalar(opts.headScale);
  torso.add(head);

  const skull = mesh(GEO.skull, opts.skin, 0, 0.04, 0.02);
  skull.scale.set(0.9, 0.95, 1.05);
  head.add(skull);

  const snout = mesh(GEO.snout, opts.skin, 0, -0.01, -0.22);
  snout.rotation.x = Math.PI / 2;
  snout.scale.set(0.9, opts.snout, 0.75);
  head.add(snout);

  // Upper teeth along the snout
  for (let i = 0; i < 5; i++) {
    const t = mesh(GEO.tooth, MAT.tooth, -0.035 + i * 0.017, -0.05, -0.14 - i * 0.04 * opts.snout);
    t.rotation.x = Math.PI;
    head.add(t);
  }

  head.add(mesh(GEO.nostril, opts.dark, -0.035, 0.02, -0.38 * opts.snout));
  head.add(mesh(GEO.nostril, opts.dark, 0.035, 0.02, -0.38 * opts.snout));

  for (const side of [-1, 1]) {
    const lid = mesh(GEO.lid, opts.skin, side * 0.09, 0.06, -0.08);
    lid.scale.set(0.7, 0.55, 0.5);
    head.add(lid);
    head.add(mesh(GEO.eye, eyes, side * 0.09, 0.055, -0.1));
    const brow = mesh(GEO.brow, opts.dark, side * 0.08, 0.11, -0.05);
    brow.scale.set(1.2, 0.6, 0.8);
    head.add(brow);
  }

  const jaw = addJaw(head, opts.snout);
  addTail(torso, opts.dark, opts.skin, opts.tailThick);
  const armL = addArm(torso, -1, opts.skin, opts.armScale);
  const armR = addArm(torso, 1, opts.skin, opts.armScale);
  const legL = addLeg(body, -1, opts.skin, opts.dark, opts.hipY - 0.02, opts.legThick, opts.sickle);
  const legR = addLeg(body, 1, opts.skin, opts.dark, opts.hipY - 0.02, opts.legThick, opts.sickle);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.02, -0.42 * opts.snout);
  head.add(muzzle);

  return {
    root, body, torso, head, armL, armR, legL, legR, jaw,
    eyeMat: eyes, skinMat: opts.skin as THREE.MeshLambertMaterial, muzzle,
  };
}

/** Velociraptor — film tan stripes, sickle claw, lean runner. */
export function buildRaptor(): GoblinRig {
  const rig = buildTheropod({
    skin: MAT.raptor,
    dark: MAT.raptorDark,
    belly: MAT.raptorBelly,
    eye: "#ffb020",
    hipY: 0.9,
    bodyScale: [0.95, 0.92, 1],
    headScale: 1,
    snout: 1.1,
    neckLift: -0.1,
    armScale: 0.9,
    legThick: 1,
    tailThick: 0.95,
    sickle: true,
  });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const stripe = mesh(GEO.stripe, MAT.raptorStripe, side * 0.18, 0.1, -0.05 - i * 0.16);
      stripe.rotation.z = side * 0.15;
      stripe.scale.set(1, 0.9 - i * 0.08, 1);
      rig.torso.add(stripe);
    }
  }
  for (let i = 0; i < 4; i++) {
    const ridge = mesh(GEO.ridge, MAT.raptorDark, 0, 0.26, -0.05 - i * 0.14);
    ridge.scale.set(0.8, 0.7, 1.2);
    rig.torso.add(ridge);
  }
  return rig;
}

/** Dilophosaurus — green spitter, twin crests, frill flares on spit. */
export function buildDilo(): GoblinRig {
  const rig = buildTheropod({
    skin: MAT.dilo,
    dark: MAT.diloDark,
    belly: MAT.diloBelly,
    eye: "#ffe040",
    hipY: 0.84,
    bodyScale: [0.88, 0.9, 0.95],
    headScale: 1.05,
    snout: 1.45,
    neckLift: 0.25,
    armScale: 0.75,
    legThick: 0.92,
    tailThick: 0.85,
    sickle: false,
  });

  for (const side of [-1, 1]) {
    const crest = mesh(GEO.crest, MAT.diloCrest, side * 0.055, 0.18, -0.02);
    crest.scale.set(0.45, 1.35, 1.1);
    crest.rotation.x = -0.55;
    crest.rotation.z = side * -0.25;
    rig.head.add(crest);
    // Soft crest membrane between bone and skull
    const web = mesh(GEO.crest, MAT.diloBelly, side * 0.035, 0.12, 0.02);
    web.scale.set(0.25, 0.9, 0.7);
    web.rotation.x = -0.4;
    rig.head.add(web);
  }

  const frill = new THREE.Group();
  frill.position.set(0, 0.0, 0.1);
  rig.head.add(frill);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const panel = mesh(
        GEO.frill,
        i % 2 === 0 ? MAT.diloFrill : MAT.diloFrillIn,
        side * (0.06 + i * 0.07),
        0.02 + i * 0.015,
        -0.01 * i,
      );
      panel.scale.set(0.55 + i * 0.08, 0.7 + i * 0.08, 1);
      panel.rotation.y = side * (0.55 + i * 0.32);
      panel.rotation.x = -0.2;
      frill.add(panel);
    }
  }
  frill.scale.set(0.32, 0.36, 1);
  rig.root.userData.frill = frill;
  return rig;
}

/** T. rex — heavy film silhouette, massive head, stub arms. */
export function buildTrex(): GoblinRig {
  const rig = buildTheropod({
    skin: MAT.trex,
    dark: MAT.trexDark,
    belly: MAT.trexBelly,
    eye: "#ff4020",
    hipY: 1.08,
    bodyScale: [1.4, 1.25, 1.3],
    headScale: 1.6,
    snout: 1.45,
    neckLift: 0.08,
    armScale: 0.42,
    legThick: 1.4,
    tailThick: 1.3,
    sickle: false,
  });
  for (let i = 0; i < 5; i++) {
    const ridge = mesh(GEO.ridge, MAT.trexDark, 0, 0.3, 0.08 - i * 0.16);
    ridge.scale.set(1.2, 1, 1.4);
    rig.torso.add(ridge);
  }
  // Heavier brow bosses
  for (const side of [-1, 1]) {
    const boss = mesh(GEO.brow, MAT.trexDark, side * 0.1, 0.14, -0.04);
    boss.scale.set(1.6, 1.1, 1.2);
    rig.head.add(boss);
  }
  return rig;
}

export function buildDino(kind: DinoKind): GoblinRig {
  if (kind === "dilo") return buildDilo();
  if (kind === "trex") return buildTrex();
  return buildRaptor();
}
