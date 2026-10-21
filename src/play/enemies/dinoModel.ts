import * as THREE from "three";
import type { DinoKind, GoblinRig } from "./goblinModel.ts";

/** Shared low-poly parts. One buffer set for every dinosaur in the wave. */
const GEO = {
  spine: new THREE.CapsuleGeometry(0.16, 0.62, 3, 6),
  belly: new THREE.SphereGeometry(0.15, 7, 5),
  neck: new THREE.CapsuleGeometry(0.055, 0.32, 2, 5),
  head: new THREE.SphereGeometry(0.11, 8, 6),
  snout: new THREE.CapsuleGeometry(0.045, 0.26, 2, 5),
  jaw: new THREE.BoxGeometry(0.07, 0.028, 0.22),
  tooth: new THREE.ConeGeometry(0.01, 0.04, 4),
  eye: new THREE.SphereGeometry(0.016, 6, 4),
  brow: new THREE.BoxGeometry(0.09, 0.018, 0.04),
  thigh: new THREE.CapsuleGeometry(0.065, 0.3, 2, 5),
  shin: new THREE.CapsuleGeometry(0.04, 0.28, 2, 5),
  foot: new THREE.BoxGeometry(0.07, 0.035, 0.18),
  toe: new THREE.ConeGeometry(0.016, 0.08, 4),
  sickle: new THREE.ConeGeometry(0.022, 0.18, 5),
  tail: new THREE.CapsuleGeometry(0.055, 0.36, 2, 5),
  arm: new THREE.CapsuleGeometry(0.025, 0.12, 2, 4),
  stripe: new THREE.BoxGeometry(0.2, 0.025, 0.07),
  crest: new THREE.BoxGeometry(0.02, 0.22, 0.08),
  frill: new THREE.CircleGeometry(0.2, 5),
  feather: new THREE.ConeGeometry(0.035, 0.14, 4),
  spot: new THREE.SphereGeometry(0.035, 5, 4),
};

const MAT = {
  raptor: new THREE.MeshLambertMaterial({ color: "#4a6a2a" }),
  raptorDark: new THREE.MeshLambertMaterial({ color: "#1c2c10" }),
  raptorBelly: new THREE.MeshLambertMaterial({ color: "#d8d0a4" }),
  raptorStripe: new THREE.MeshLambertMaterial({ color: "#12180c" }),
  dilo: new THREE.MeshLambertMaterial({ color: "#c4a15a" }),
  diloDark: new THREE.MeshLambertMaterial({ color: "#6a4820" }),
  diloBelly: new THREE.MeshLambertMaterial({ color: "#f0e2b0" }),
  diloCrest: new THREE.MeshLambertMaterial({ color: "#e23a18" }),
  diloFrill: new THREE.MeshLambertMaterial({ color: "#ff4a28", side: THREE.DoubleSide }),
  diloFrillIn: new THREE.MeshLambertMaterial({ color: "#f2e28a", side: THREE.DoubleSide }),
  trex: new THREE.MeshLambertMaterial({ color: "#6a5438" }),
  trexDark: new THREE.MeshLambertMaterial({ color: "#2c2216" }),
  trexBelly: new THREE.MeshLambertMaterial({ color: "#c4b090" }),
  claw: new THREE.MeshLambertMaterial({ color: "#14120e" }),
  tooth: new THREE.MeshLambertMaterial({ color: "#f4f0e4" }),
};

function piece(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = false) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  return mesh;
}

function eyeMat(color: string) {
  return new THREE.MeshStandardMaterial({
    color: "#140c06",
    emissive: color,
    emissiveIntensity: 2.6,
    roughness: 0.4,
  });
}

/** Digitigrade leg. Group rotation.x is the walk cycle; the bend lives on the meshes. */
function addLeg(
  body: THREE.Group,
  side: number,
  skin: THREE.Material,
  dark: THREE.Material,
  hipY: number,
  sickle: boolean,
): THREE.Group {
  const hip = new THREE.Group();
  hip.position.set(0.15 * side, hipY, 0.02);
  body.add(hip);

  const thigh = piece(GEO.thigh, dark, 0, -0.2, 0.05, true);
  thigh.rotation.x = -0.65;
  hip.add(thigh);

  const shin = piece(GEO.shin, skin, 0, -0.46, -0.1);
  shin.rotation.x = 1.05;
  hip.add(shin);

  hip.add(piece(GEO.foot, dark, 0, -0.58, -0.22));
  for (let i = -1; i <= 1; i++) {
    const toe = piece(GEO.toe, MAT.claw, i * 0.035, -0.6, -0.34);
    toe.rotation.x = Math.PI / 2;
    hip.add(toe);
  }
  if (sickle) {
    const claw = piece(GEO.sickle, MAT.claw, 0.04 * side, -0.42, -0.02);
    claw.rotation.set(-1.15, 0, 0.15 * side);
    hip.add(claw);
  }
  return hip;
}

function addArm(torso: THREE.Group, side: number, skin: THREE.Material, scale: number) {
  const arm = new THREE.Group();
  arm.position.set(0.18 * side, 0.08, -0.32);
  arm.scale.setScalar(scale);
  const upper = piece(GEO.arm, skin, 0, -0.08, -0.02);
  upper.rotation.x = 0.7;
  arm.add(upper);
  const hand = piece(GEO.toe, MAT.claw, 0, -0.16, -0.08);
  hand.rotation.x = 2.2;
  arm.add(hand);
  const hand2 = piece(GEO.toe, MAT.claw, 0.03 * side, -0.15, -0.06);
  hand2.rotation.x = 2.2;
  arm.add(hand2);
  torso.add(arm);
  return arm;
}

function addTail(torso: THREE.Group, dark: THREE.Material, accent: THREE.Material, feathers: boolean) {
  const segs = [
    { z: 0.38, y: 0.06, s: 1.05 },
    { z: 0.72, y: 0.16, s: 0.72 },
    { z: 1.02, y: 0.26, s: 0.42 },
  ];
  for (const seg of segs) {
    const t = piece(GEO.tail, dark, 0, seg.y, seg.z, seg.s > 0.7);
    t.rotation.x = 1.25;
    t.scale.setScalar(seg.s);
    torso.add(t);
    if (feathers) {
      const f = piece(GEO.feather, accent, 0, seg.y + 0.1, seg.z);
      f.rotation.x = -0.4;
      f.scale.setScalar(seg.s);
      torso.add(f);
    }
  }
}

function addJaw(head: THREE.Group, snoutLen: number) {
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.04, -0.06);
  head.add(jaw);
  const bone = piece(GEO.jaw, MAT.tooth, 0, 0, -snoutLen * 0.45);
  bone.scale.set(0.9, 1, snoutLen);
  jaw.add(bone);
  for (let i = 0; i < 4; i++) {
    const tooth = piece(GEO.tooth, MAT.tooth, -0.025 + i * 0.016, 0.02, -0.08 - i * 0.03);
    tooth.rotation.x = Math.PI;
    jaw.add(tooth);
  }
  return jaw;
}

interface TheropodOpts {
  skin: THREE.Material;
  dark: THREE.Material;
  belly: THREE.Material;
  eye: string;
  hipY: number;
  snout: number;
  neckPitch: number;
  armScale: number;
  sickle: boolean;
  feathers: boolean;
  headScale: number;
}

function buildTheropod(opts: TheropodOpts): GoblinRig {
  const eyes = eyeMat(opts.eye);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = opts.hipY;
  body.add(torso);

  const spine = piece(GEO.spine, opts.skin, 0, 0.06, -0.08, true);
  spine.rotation.x = Math.PI / 2;
  spine.scale.set(1, 1.2, 0.82);
  torso.add(spine);

  const chest = piece(GEO.belly, opts.skin, 0, 0.08, -0.42, true);
  chest.scale.set(0.95, 0.85, 1.15);
  torso.add(chest);

  const belly = piece(GEO.belly, opts.belly, 0, -0.08, -0.12);
  belly.scale.set(0.9, 0.55, 1.35);
  torso.add(belly);

  const neck = piece(GEO.neck, opts.skin, 0, 0.22, -0.52);
  neck.rotation.x = opts.neckPitch;
  neck.scale.set(1, 1, 1.05);
  torso.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.48, -0.78);
  head.scale.setScalar(opts.headScale);
  torso.add(head);

  const skull = piece(GEO.head, opts.skin, 0, 0.02, 0, true);
  skull.scale.set(0.85, 0.9, 1.05);
  head.add(skull);

  const snout = piece(GEO.snout, opts.skin, 0, -0.01, -0.2);
  snout.rotation.x = Math.PI / 2;
  snout.scale.set(0.85, opts.snout, 0.7);
  head.add(snout);

  const stripe = piece(GEO.stripe, opts.dark, 0, 0.02, -0.08);
  stripe.scale.set(1.15, 0.7, 1.4);
  head.add(stripe);

  head.add(piece(GEO.eye, eyes, -0.07, 0.045, -0.06));
  head.add(piece(GEO.eye, eyes, 0.07, 0.045, -0.06));
  const browL = piece(GEO.brow, opts.dark, -0.05, 0.08, -0.04);
  browL.rotation.z = 0.35;
  head.add(browL);
  const browR = piece(GEO.brow, opts.dark, 0.05, 0.08, -0.04);
  browR.rotation.z = -0.35;
  head.add(browR);

  const jaw = addJaw(head, opts.snout);
  addTail(torso, opts.dark, opts.skin, opts.feathers);
  const armL = addArm(torso, -1, opts.skin, opts.armScale);
  const armR = addArm(torso, 1, opts.skin, opts.armScale);
  const legL = addLeg(body, -1, opts.skin, opts.dark, opts.hipY - 0.02, opts.sickle);
  const legR = addLeg(body, 1, opts.skin, opts.dark, opts.hipY - 0.02, opts.sickle);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.02, -0.28 * opts.snout);
  head.add(muzzle);

  return {
    root, body, torso, head, armL, armR, legL, legR, jaw,
    eyeMat: eyes, skinMat: opts.skin as THREE.MeshLambertMaterial, muzzle,
  };
}

/** Lean feathered runner: long balancing tail, raised sickle claw, eye mask. */
export function buildRaptor(): GoblinRig {
  const rig = buildTheropod({
    skin: MAT.raptor,
    dark: MAT.raptorDark,
    belly: MAT.raptorBelly,
    eye: "#d6ff40",
    hipY: 0.92,
    snout: 1.15,
    neckPitch: -1.05,
    armScale: 0.85,
    sickle: true,
    feathers: true,
    headScale: 0.95,
  });
  for (let i = 0; i < 3; i++) {
    const band = piece(GEO.stripe, MAT.raptorStripe, 0, 0.2, -0.15 + i * 0.22);
    rig.torso.add(band);
  }
  const crest = piece(GEO.feather, MAT.raptorDark, 0, 0.14, 0.04);
  crest.scale.set(0.7, 1.1, 0.6);
  rig.head.add(crest);
  return rig;
}

/** Twin cranial crests plus a neck frill that flares when it spits. */
export function buildDilo(): GoblinRig {
  const rig = buildTheropod({
    skin: MAT.dilo,
    dark: MAT.diloDark,
    belly: MAT.diloBelly,
    eye: "#ffe14a",
    hipY: 0.98,
    snout: 1.65,
    neckPitch: -0.85,
    armScale: 0.7,
    sickle: false,
    feathers: false,
    headScale: 1.05,
  });

  for (const side of [-1, 1]) {
    const crest = piece(GEO.crest, MAT.diloCrest, side * 0.045, 0.14, -0.04);
    crest.rotation.x = -0.65;
    crest.rotation.z = side * -0.12;
    rig.head.add(crest);
  }

  for (let i = 0; i < 4; i++) {
    const spot = piece(GEO.spot, MAT.diloDark, (i % 2 === 0 ? -0.08 : 0.08), 0.16, -0.2 + i * 0.16);
    spot.scale.set(1, 0.6, 1.2);
    rig.torso.add(spot);
  }

  const frill = new THREE.Group();
  frill.position.set(0, -0.02, 0.1);
  rig.head.add(frill);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const panel = piece(GEO.frill, i === 1 ? MAT.diloFrillIn : MAT.diloFrill, side * (0.08 + i * 0.11), 0.02, -0.02 * i);
      panel.rotation.y = side * (0.55 + i * 0.38);
      panel.rotation.x = -0.25;
      frill.add(panel);
    }
  }
  frill.scale.set(0.38, 0.42, 1);
  rig.root.userData.frill = frill;
  return rig;
}

export function buildTrex(): GoblinRig {
  const rig = buildTheropod({
    skin: MAT.trex,
    dark: MAT.trexDark,
    belly: MAT.trexBelly,
    eye: "#ff3020",
    hipY: 1.15,
    snout: 1.35,
    neckPitch: -0.55,
    armScale: 0.38,
    sickle: false,
    feathers: false,
    headScale: 1.45,
  });
  rig.torso.scale.set(1.25, 1.15, 1.2);
  return rig;
}

export function buildDino(kind: DinoKind): GoblinRig {
  if (kind === "dilo") return buildDilo();
  if (kind === "trex") return buildTrex();
  return buildRaptor();
}
