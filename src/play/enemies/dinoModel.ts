import * as THREE from "three";
import type { DinoKind, GoblinRig } from "./goblinModel.ts";

/**
 * SNES Jurassic Park (Ocean, 1993) inspired dinosaurs.
 * Chunky pre-rendered volumes, movie palette, readable silhouettes —
 * not skeletal capsules. Shared buffers for every dino in the wave.
 */
const GEO = {
  torso: new THREE.BoxGeometry(0.42, 0.38, 0.78),
  chest: new THREE.BoxGeometry(0.4, 0.34, 0.36),
  belly: new THREE.BoxGeometry(0.36, 0.22, 0.55),
  hip: new THREE.BoxGeometry(0.44, 0.28, 0.34),
  neck: new THREE.BoxGeometry(0.16, 0.2, 0.28),
  skull: new THREE.BoxGeometry(0.26, 0.24, 0.28),
  snout: new THREE.BoxGeometry(0.18, 0.14, 0.36),
  jaw: new THREE.BoxGeometry(0.16, 0.06, 0.3),
  tooth: new THREE.BoxGeometry(0.018, 0.05, 0.018),
  eye: new THREE.BoxGeometry(0.04, 0.035, 0.02),
  brow: new THREE.BoxGeometry(0.1, 0.03, 0.05),
  thigh: new THREE.BoxGeometry(0.16, 0.36, 0.2),
  shin: new THREE.BoxGeometry(0.11, 0.34, 0.12),
  foot: new THREE.BoxGeometry(0.12, 0.06, 0.26),
  toe: new THREE.BoxGeometry(0.03, 0.04, 0.1),
  sickle: new THREE.BoxGeometry(0.04, 0.14, 0.05),
  arm: new THREE.BoxGeometry(0.07, 0.18, 0.07),
  hand: new THREE.BoxGeometry(0.05, 0.05, 0.08),
  tail: new THREE.BoxGeometry(0.2, 0.18, 0.36),
  stripe: new THREE.BoxGeometry(0.02, 0.22, 0.5),
  crest: new THREE.BoxGeometry(0.04, 0.2, 0.18),
  frillPanel: new THREE.BoxGeometry(0.22, 0.28, 0.02),
  ridge: new THREE.BoxGeometry(0.06, 0.05, 0.08),
};

/** Film / SNES outdoor palette. */
const MAT = {
  raptor: new THREE.MeshLambertMaterial({ color: "#9a7a42" }),
  raptorDark: new THREE.MeshLambertMaterial({ color: "#4a3418" }),
  raptorBelly: new THREE.MeshLambertMaterial({ color: "#d8c490" }),
  raptorStripe: new THREE.MeshLambertMaterial({ color: "#2a1c0c" }),
  dilo: new THREE.MeshLambertMaterial({ color: "#6cb038" }),
  diloDark: new THREE.MeshLambertMaterial({ color: "#2e6018" }),
  diloBelly: new THREE.MeshLambertMaterial({ color: "#c8e070" }),
  diloCrest: new THREE.MeshLambertMaterial({ color: "#e8a020" }),
  diloFrill: new THREE.MeshLambertMaterial({ color: "#e84828" }),
  diloFrillIn: new THREE.MeshLambertMaterial({ color: "#f2d060" }),
  trex: new THREE.MeshLambertMaterial({ color: "#a86a38" }),
  trexDark: new THREE.MeshLambertMaterial({ color: "#5a3418" }),
  trexBelly: new THREE.MeshLambertMaterial({ color: "#d4b078" }),
  claw: new THREE.MeshLambertMaterial({ color: "#1a1410" }),
  tooth: new THREE.MeshLambertMaterial({ color: "#f0ebe0" }),
};

function box(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = false) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  return mesh;
}

function eyeMat(emissive: string) {
  return new THREE.MeshStandardMaterial({
    color: "#1a0c04",
    emissive,
    emissiveIntensity: 2.4,
    roughness: 0.45,
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
  hip.position.set(0.16 * side * thick, hipY, 0.04);
  body.add(hip);

  const thigh = box(GEO.thigh, dark, 0, -0.16, 0.04, true);
  thigh.scale.set(thick, 1, thick);
  thigh.rotation.x = -0.55;
  hip.add(thigh);

  const shin = box(GEO.shin, skin, 0, -0.42, -0.08);
  shin.scale.set(thick * 0.9, 1, thick);
  shin.rotation.x = 0.95;
  hip.add(shin);

  const foot = box(GEO.foot, dark, 0, -0.58, -0.18);
  foot.scale.set(thick, 1, 1);
  hip.add(foot);

  for (let i = -1; i <= 1; i++) {
    const toe = box(GEO.toe, MAT.claw, i * 0.035 * thick, -0.58, -0.32);
    hip.add(toe);
  }
  if (sickle) {
    const claw = box(GEO.sickle, MAT.claw, 0.05 * side, -0.36, -0.02);
    claw.rotation.x = -0.9;
    hip.add(claw);
  }
  return hip;
}

function addArm(torso: THREE.Group, side: number, skin: THREE.Material, scale: number) {
  const arm = new THREE.Group();
  arm.position.set(0.22 * side, 0.02, -0.28);
  arm.scale.setScalar(scale);
  const upper = box(GEO.arm, skin, 0, -0.08, 0);
  upper.rotation.x = 0.85;
  arm.add(upper);
  arm.add(box(GEO.hand, MAT.claw, 0, -0.18, -0.04));
  torso.add(arm);
  return arm;
}

function addTail(torso: THREE.Group, dark: THREE.Material, skin: THREE.Material, thick: number) {
  const segs = [
    { z: 0.42, y: 0.02, s: 1.05 * thick, mat: dark },
    { z: 0.72, y: 0.08, s: 0.78 * thick, mat: skin },
    { z: 0.98, y: 0.14, s: 0.52 * thick, mat: dark },
    { z: 1.18, y: 0.2, s: 0.32 * thick, mat: skin },
  ];
  for (const seg of segs) {
    const t = box(GEO.tail, seg.mat, 0, seg.y, seg.z, seg.s > 0.7);
    t.scale.setScalar(seg.s);
    torso.add(t);
  }
}

function addJaw(head: THREE.Group, snoutScale: number) {
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, -0.04);
  head.add(jaw);
  const bone = box(GEO.jaw, MAT.claw, 0, 0, -0.14 * snoutScale);
  bone.scale.set(1, 1, snoutScale);
  jaw.add(bone);
  for (let i = 0; i < 5; i++) {
    jaw.add(box(GEO.tooth, MAT.tooth, -0.05 + i * 0.025, 0.04, -0.08 - i * 0.035 * snoutScale));
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

function buildChunkyTheropod(opts: BuildOpts): GoblinRig {
  const eyes = eyeMat(opts.eye);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = opts.hipY;
  torso.scale.set(...opts.bodyScale);
  body.add(torso);

  // Horizontal SNES-era body: hip block → long torso → chest, facing -Z.
  torso.add(box(GEO.hip, opts.dark, 0, -0.02, 0.18, true));
  const torsoMesh = box(GEO.torso, opts.skin, 0, 0.04, -0.12, true);
  torso.add(torsoMesh);
  torso.add(box(GEO.chest, opts.skin, 0, 0.06, -0.48, true));
  torso.add(box(GEO.belly, opts.belly, 0, -0.12, -0.1));

  const neck = box(GEO.neck, opts.skin, 0, 0.18 + opts.neckLift * 0.1, -0.62);
  neck.rotation.x = -0.35 + opts.neckLift;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.32 + opts.neckLift * 0.35, -0.82);
  head.scale.setScalar(opts.headScale);
  torso.add(head);

  head.add(box(GEO.skull, opts.skin, 0, 0.04, 0.02, true));
  const snout = box(GEO.snout, opts.skin, 0, -0.01, -0.26);
  snout.scale.set(1, 1, opts.snout);
  head.add(snout);
  head.add(box(GEO.brow, opts.dark, -0.07, 0.12, -0.02));
  head.add(box(GEO.brow, opts.dark, 0.07, 0.12, -0.02));
  head.add(box(GEO.eye, eyes, -0.1, 0.05, -0.1));
  head.add(box(GEO.eye, eyes, 0.1, 0.05, -0.1));

  const jaw = addJaw(head, opts.snout);
  addTail(torso, opts.dark, opts.skin, opts.tailThick);
  const armL = addArm(torso, -1, opts.skin, opts.armScale);
  const armR = addArm(torso, 1, opts.skin, opts.armScale);
  const legL = addLeg(body, -1, opts.skin, opts.dark, opts.hipY, opts.legThick, opts.sickle);
  const legR = addLeg(body, 1, opts.skin, opts.dark, opts.hipY, opts.legThick, opts.sickle);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.02, -0.42 * opts.snout);
  head.add(muzzle);

  return {
    root, body, torso, head, armL, armR, legL, legR, jaw,
    eyeMat: eyes, skinMat: opts.skin as THREE.MeshLambertMaterial, muzzle,
  };
}

/** Velociraptor — tan/brown movie stripes, sickle claw, no feathers (SNES/1993). */
export function buildRaptor(): GoblinRig {
  const rig = buildChunkyTheropod({
    skin: MAT.raptor,
    dark: MAT.raptorDark,
    belly: MAT.raptorBelly,
    eye: "#ffb020",
    hipY: 0.88,
    bodyScale: [0.95, 0.92, 1],
    headScale: 1,
    snout: 1.05,
    neckLift: -0.15,
    armScale: 0.85,
    legThick: 1,
    tailThick: 0.9,
    sickle: true,
  });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const stripe = box(GEO.stripe, MAT.raptorStripe, side * 0.2, 0.08, -0.05 - i * 0.18);
      stripe.scale.set(1, 0.85 - i * 0.1, 0.7);
      rig.torso.add(stripe);
    }
  }
  for (let i = 0; i < 3; i++) {
    rig.torso.add(box(GEO.ridge, MAT.raptorDark, 0, 0.24, -0.1 - i * 0.16));
  }
  return rig;
}

/** Dilophosaurus — green SNES “spitter,” twin crests, frill that flares on spit. */
export function buildDilo(): GoblinRig {
  const rig = buildChunkyTheropod({
    skin: MAT.dilo,
    dark: MAT.diloDark,
    belly: MAT.diloBelly,
    eye: "#ffe040",
    hipY: 0.82,
    bodyScale: [0.85, 0.88, 0.92],
    headScale: 1.05,
    snout: 1.35,
    neckLift: 0.2,
    armScale: 0.7,
    legThick: 0.9,
    tailThick: 0.8,
    sickle: false,
  });

  for (const side of [-1, 1]) {
    const crest = box(GEO.crest, MAT.diloCrest, side * 0.06, 0.2, -0.02);
    crest.rotation.x = -0.5;
    crest.rotation.z = side * -0.2;
    rig.head.add(crest);
  }

  // Neck frill — folded by default; goblins.ts scales userData.frill on windup/spit.
  const frill = new THREE.Group();
  frill.position.set(0, 0.02, 0.12);
  rig.head.add(frill);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const panel = box(
        GEO.frillPanel,
        i === 1 ? MAT.diloFrillIn : MAT.diloFrill,
        side * (0.12 + i * 0.1),
        0.04 + i * 0.02,
        -0.02 * i,
      );
      panel.rotation.y = side * (0.7 + i * 0.35);
      panel.rotation.z = side * 0.15;
      frill.add(panel);
    }
  }
  frill.scale.set(0.35, 0.4, 1);
  rig.root.userData.frill = frill;
  return rig;
}

/** T. rex — heavy brown film silhouette, huge head, stub arms. */
export function buildTrex(): GoblinRig {
  const rig = buildChunkyTheropod({
    skin: MAT.trex,
    dark: MAT.trexDark,
    belly: MAT.trexBelly,
    eye: "#ff4020",
    hipY: 1.05,
    bodyScale: [1.35, 1.2, 1.25],
    headScale: 1.55,
    snout: 1.4,
    neckLift: 0.05,
    armScale: 0.4,
    legThick: 1.35,
    tailThick: 1.25,
    sickle: false,
  });
  for (let i = 0; i < 4; i++) {
    rig.torso.add(box(GEO.ridge, MAT.trexDark, 0, 0.28, 0.05 - i * 0.18));
  }
  return rig;
}

export function buildDino(kind: DinoKind): GoblinRig {
  if (kind === "dilo") return buildDilo();
  if (kind === "trex") return buildTrex();
  return buildRaptor();
}
