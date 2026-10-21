import * as THREE from "three";
import type { DinoKind, GoblinRig } from "./goblinModel.ts";

const G = {
  body: new THREE.CapsuleGeometry(0.22, 0.55, 5, 10),
  chest: new THREE.SphereGeometry(0.28, 12, 10),
  hip: new THREE.SphereGeometry(0.24, 10, 8),
  neck: new THREE.CapsuleGeometry(0.12, 0.28, 4, 8),
  head: new THREE.SphereGeometry(0.2, 14, 12),
  snout: new THREE.BoxGeometry(0.16, 0.14, 0.36),
  jaw: new THREE.BoxGeometry(0.14, 0.08, 0.28),
  eye: new THREE.SphereGeometry(0.035, 8, 6),
  arm: new THREE.CapsuleGeometry(0.05, 0.22, 3, 6),
  claw: new THREE.ConeGeometry(0.03, 0.1, 5),
  leg: new THREE.CapsuleGeometry(0.09, 0.42, 3, 8),
  shin: new THREE.CapsuleGeometry(0.07, 0.32, 3, 6),
  foot: new THREE.BoxGeometry(0.14, 0.06, 0.28),
  toe: new THREE.ConeGeometry(0.028, 0.12, 5),
  tail: new THREE.CapsuleGeometry(0.1, 0.9, 4, 8),
  frill: new THREE.CircleGeometry(0.42, 10),
  crest: new THREE.BoxGeometry(0.08, 0.22, 0.04),
};

const mats = {
  raptor: new THREE.MeshLambertMaterial({ color: "#3a5a28" }),
  raptorDark: new THREE.MeshLambertMaterial({ color: "#1e3014" }),
  raptorBelly: new THREE.MeshLambertMaterial({ color: "#8a9a58" }),
  dilo: new THREE.MeshLambertMaterial({ color: "#6a4a28" }),
  diloDark: new THREE.MeshLambertMaterial({ color: "#3a2814" }),
  diloFrill: new THREE.MeshLambertMaterial({ color: "#c04060", side: THREE.DoubleSide }),
  trex: new THREE.MeshLambertMaterial({ color: "#5a4830" }),
  trexDark: new THREE.MeshLambertMaterial({ color: "#2e2418" }),
  trexBelly: new THREE.MeshLambertMaterial({ color: "#8a7860" }),
  claw: new THREE.MeshLambertMaterial({ color: "#1a1814" }),
  tooth: new THREE.MeshLambertMaterial({ color: "#e8e0d0" }),
};

function m(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function limb(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, y: number) {
  const g = new THREE.Group();
  g.position.y = y;
  g.add(m(geo, mat));
  parent.add(g);
  return g;
}

function buildBase(skin: THREE.MeshLambertMaterial, dark: THREE.MeshLambertMaterial, belly: THREE.MeshLambertMaterial, opts: {
  bodyScale?: number;
  headScale?: number;
  armScale?: number;
  legThick?: number;
  tailLen?: number;
  eyeEmissive: string;
}): GoblinRig {
  const eyeMat = new THREE.MeshStandardMaterial({
    color: "#1a1008",
    emissive: opts.eyeEmissive,
    emissiveIntensity: 2.8,
    roughness: 0.35,
  });
  const bs = opts.bodyScale ?? 1;
  const hs = opts.headScale ?? 1;
  const as = opts.armScale ?? 1;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = 1.05;
  body.add(torso);
  const trunk = m(G.body, skin, 0, 0.05, 0);
  trunk.scale.set(1.1 * bs, 1 * bs, 1.35 * bs);
  trunk.rotation.x = 0.55;
  torso.add(trunk);
  const chest = m(G.chest, belly, 0, 0.12, -0.08);
  chest.scale.set(1.05 * bs, 0.75 * bs, 0.9 * bs);
  torso.add(chest);
  const hips = m(G.hip, dark, 0, -0.28, 0.06);
  hips.scale.set(1.15 * bs, 0.7 * bs, 1 * bs);
  torso.add(hips);

  const neck = m(G.neck, skin, 0, 0.38, -0.32);
  neck.rotation.x = -0.7;
  neck.scale.setScalar(hs);
  torso.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.55, -0.55);
  head.scale.setScalar(hs);
  torso.add(head);
  const skull = m(G.head, skin);
  skull.scale.set(1.05, 1.1, 1.2);
  head.add(skull);
  const snout = m(G.snout, skin, 0, -0.02, -0.28);
  snout.scale.set(1, 0.85, 1);
  head.add(snout);
  head.add(m(G.eye, eyeMat, -0.12, 0.06, -0.08), m(G.eye, eyeMat, 0.12, 0.06, -0.08));

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, -0.12);
  head.add(jaw);
  jaw.add(m(G.jaw, dark, 0, 0, -0.12));
  for (let i = 0; i < 4; i++) {
    const t = m(G.claw, mats.tooth, -0.05 + i * 0.035, 0.02, -0.22);
    t.scale.set(0.5, 0.6, 0.5);
    t.rotation.x = Math.PI;
    jaw.add(t);
  }

  const armL = limb(torso, G.arm, skin, 0.15);
  armL.position.set(-0.32 * as, 0.1, -0.05);
  armL.scale.setScalar(as);
  const armR = limb(torso, G.arm, skin, 0.15);
  armR.position.set(0.32 * as, 0.1, -0.05);
  armR.scale.setScalar(as);
  const clawL = m(G.claw, mats.claw, 0, -0.22, 0);
  clawL.rotation.x = Math.PI;
  armL.add(clawL);
  const clawR = m(G.claw, mats.claw, 0, -0.22, 0);
  clawR.rotation.x = Math.PI;
  armR.add(clawR);

  const legL = limb(body, G.leg, dark, 0.55);
  legL.position.set(-0.18, 0, 0.05);
  const legR = limb(body, G.leg, dark, 0.55);
  legR.position.set(0.18, 0, 0.05);
  for (const leg of [legL, legR]) {
    const shin = m(G.shin, skin, 0, -0.38, 0.04);
    shin.rotation.x = 0.35;
    leg.add(shin);
    const foot = m(G.foot, dark, 0, -0.58, -0.06);
    leg.add(foot);
    const sickle = m(G.toe, mats.claw, 0.04, -0.55, -0.18);
    sickle.rotation.x = 1.9;
    leg.add(sickle);
  }

  const tail = m(G.tail, dark, 0, 0.7, 0.55);
  tail.rotation.x = 1.15;
  tail.scale.set(1, opts.tailLen ?? 1, 1);
  body.add(tail);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.02, -0.48);
  head.add(muzzle);

  return {
    root, body, torso, head, armL, armR, legL, legR, jaw, eyeMat, skinMat: skin, muzzle,
  };
}

export function buildRaptor(): GoblinRig {
  const rig = buildBase(mats.raptor, mats.raptorDark, mats.raptorBelly, {
    bodyScale: 0.92,
    headScale: 0.95,
    armScale: 0.85,
    tailLen: 1.15,
    eyeEmissive: "#c8ff40",
  });
  const crest = m(G.crest, mats.raptorDark, 0, 0.18, 0.02);
  rig.head.add(crest);
  return rig;
}

export function buildDilo(): GoblinRig {
  const rig = buildBase(mats.dilo, mats.diloDark, mats.dilo, {
    bodyScale: 0.95,
    headScale: 1.05,
    armScale: 0.9,
    tailLen: 1,
    eyeEmissive: "#ff6040",
  });
  const frill = m(G.frill, mats.diloFrill, 0, 0.05, 0.12);
  frill.rotation.y = Math.PI;
  frill.scale.set(1.1, 1.2, 1);
  rig.head.add(frill);
  rig.root.userData.frill = frill;
  return rig;
}

export function buildTrex(): GoblinRig {
  const rig = buildBase(mats.trex, mats.trexDark, mats.trexBelly, {
    bodyScale: 1.35,
    headScale: 1.55,
    armScale: 0.45,
    tailLen: 1.35,
    eyeEmissive: "#ff2020",
  });
  rig.torso.position.y = 1.15;
  const brow = m(G.crest, mats.trexDark, -0.1, 0.16, -0.05);
  brow.scale.set(1.4, 0.6, 1);
  rig.head.add(brow);
  const brow2 = brow.clone();
  brow2.position.x = 0.1;
  rig.head.add(brow2);
  return rig;
}

export function buildDino(kind: DinoKind): GoblinRig {
  if (kind === "dilo") return buildDilo();
  if (kind === "trex") return buildTrex();
  return buildRaptor();
}
