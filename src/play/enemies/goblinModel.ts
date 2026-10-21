import * as THREE from "three";

export type GoblinKind = "grunt" | "runner" | "brute" | "shaman" | "king";
export type DinoKind = "raptor" | "dilo" | "trex";
export type HostileKind = GoblinKind | "geezer" | DinoKind;
export type Faction = "goblin" | "geezer" | "dino";

export interface GoblinRig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  jaw: THREE.Object3D;
  eyeMat: THREE.MeshStandardMaterial;
  skinMat: THREE.MeshLambertMaterial;
  muzzle?: THREE.Object3D;
}

/** Shared geometries — one set for every goblin in the wave. */
const G = {
  torso: new THREE.CapsuleGeometry(0.24, 0.4, 6, 14),
  belly: new THREE.SphereGeometry(0.24, 14, 12),
  pec: new THREE.SphereGeometry(0.13, 12, 10),
  deltoid: new THREE.SphereGeometry(0.1, 10, 8),
  rib: new THREE.BoxGeometry(0.38, 0.04, 0.12),
  spine: new THREE.SphereGeometry(0.05, 8, 6),
  head: new THREE.SphereGeometry(0.23, 20, 16),
  cranium: new THREE.SphereGeometry(0.19, 14, 12),
  snout: new THREE.SphereGeometry(0.15, 14, 12),
  cheek: new THREE.SphereGeometry(0.09, 10, 8),
  ear: new THREE.ConeGeometry(0.075, 0.55, 8),
  earInner: new THREE.ConeGeometry(0.04, 0.35, 6),
  nose: new THREE.ConeGeometry(0.05, 0.18, 7),
  nostril: new THREE.SphereGeometry(0.018, 6, 5),
  eye: new THREE.SphereGeometry(0.034, 12, 10),
  eyeWhite: new THREE.SphereGeometry(0.04, 10, 8),
  slit: new THREE.BoxGeometry(0.1, 0.014, 0.02),
  brow: new THREE.BoxGeometry(0.15, 0.045, 0.08),
  jaw: new THREE.BoxGeometry(0.3, 0.11, 0.24),
  tooth: new THREE.ConeGeometry(0.022, 0.11, 5),
  upperArm: new THREE.CapsuleGeometry(0.075, 0.32, 4, 10),
  foreArm: new THREE.CapsuleGeometry(0.06, 0.3, 4, 10),
  hand: new THREE.SphereGeometry(0.075, 10, 8),
  knuckle: new THREE.SphereGeometry(0.022, 6, 5),
  claw: new THREE.ConeGeometry(0.018, 0.11, 5),
  leg: new THREE.CapsuleGeometry(0.09, 0.32, 4, 10),
  calf: new THREE.CapsuleGeometry(0.075, 0.24, 4, 10),
  knee: new THREE.SphereGeometry(0.07, 8, 6),
  foot: new THREE.BoxGeometry(0.14, 0.065, 0.3),
  loin: new THREE.CylinderGeometry(0.26, 0.32, 0.18, 12),
  flap: new THREE.BoxGeometry(0.12, 0.22, 0.04),
  wart: new THREE.SphereGeometry(0.038, 7, 6),
  scar: new THREE.BoxGeometry(0.02, 0.16, 0.01),
  shaft: new THREE.CylinderGeometry(0.02, 0.026, 1.55, 8),
  wrap: new THREE.CylinderGeometry(0.028, 0.028, 0.18, 8),
  blade: new THREE.ConeGeometry(0.048, 0.34, 5),
  guard: new THREE.BoxGeometry(0.14, 0.022, 0.045),
  plate: new THREE.BoxGeometry(0.5, 0.36, 0.09),
  pauldron: new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  crown: new THREE.CylinderGeometry(0.19, 0.22, 0.11, 10, 1, true),
  crownSpike: new THREE.ConeGeometry(0.038, 0.18, 5),
  robe: new THREE.ConeGeometry(0.36, 0.82, 12, 1, true),
  staff: new THREE.CylinderGeometry(0.024, 0.032, 1.5, 7),
  orb: new THREE.IcosahedronGeometry(0.11, 1),
};

const M = {
  cloth: new THREE.MeshLambertMaterial({ color: "#3a2416" }),
  hide: new THREE.MeshLambertMaterial({ color: "#2a1a10" }),
  wrap: new THREE.MeshLambertMaterial({ color: "#5a4030" }),
  wood: new THREE.MeshLambertMaterial({ color: "#3d2814" }),
  bone: new THREE.MeshLambertMaterial({ color: "#e8d8b8" }),
  gum: new THREE.MeshLambertMaterial({ color: "#5a1810" }),
  mouth: new THREE.MeshLambertMaterial({ color: "#1a0504" }),
  steel: new THREE.MeshStandardMaterial({ color: "#8a909c", metalness: 0.88, roughness: 0.22 }),
  rust: new THREE.MeshStandardMaterial({ color: "#6a4a38", metalness: 0.55, roughness: 0.68 }),
  gold: new THREE.MeshStandardMaterial({ color: "#e0b028", metalness: 1, roughness: 0.24, emissive: "#3a2400", emissiveIntensity: 0.35 }),
  robe: new THREE.MeshLambertMaterial({ color: "#2a1438", side: THREE.DoubleSide }),
  earPink: new THREE.MeshLambertMaterial({ color: "#6a5038" }),
  white: new THREE.MeshLambertMaterial({ color: "#e8e0c8" }),
};

const SKIN: Record<GoblinKind, string> = {
  grunt: "#5a6a3a",
  runner: "#6a7040",
  brute: "#4a5834",
  shaman: "#586848",
  king: "#3e4e2c",
};
const SKIN_DARK: Record<GoblinKind, string> = {
  grunt: "#3e4a28",
  runner: "#4a5030",
  brute: "#323c22",
  shaman: "#3e4834",
  king: "#2a3420",
};
const EYES: Record<GoblinKind, string> = {
  grunt: "#e82810",
  runner: "#e8a010",
  brute: "#e81838",
  shaman: "#a848e8",
  king: "#e86010",
};

const skinCache = new Map<GoblinKind, THREE.MeshLambertMaterial>();
const skinDarkCache = new Map<GoblinKind, THREE.MeshLambertMaterial>();
function skinFor(kind: GoblinKind, dark = false) {
  const cache = dark ? skinDarkCache : skinCache;
  let mat = cache.get(kind);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: dark ? SKIN_DARK[kind] : SKIN[kind] });
    cache.set(kind, mat);
  }
  return mat;
}

function m(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function spear(kind: GoblinKind) {
  const g = new THREE.Group();
  const len = kind === "king" ? 1.15 : kind === "brute" ? 1.05 : 1;
  g.add(m(G.shaft, M.wood, 0, -0.55 * len, 0));
  g.add(m(G.wrap, M.wrap, 0, -0.25 * len, 0));
  const blade = m(G.blade, kind === "king" ? M.gold : M.steel, 0, -1.32 * len, 0);
  blade.rotation.x = Math.PI;
  g.add(blade);
  g.add(m(G.guard, kind === "king" ? M.gold : M.rust, 0, -1.12 * len, 0));
  const tip = new THREE.Object3D();
  tip.position.set(0, -1.48 * len, 0);
  g.add(tip);
  g.userData.tip = tip;
  return g;
}

/** Hunched, snouted goblin facing -z, feet at y=0. */
export function buildGoblin(kind: GoblinKind): GoblinRig {
  const skinMat = skinFor(kind);
  const skinDark = skinFor(kind, true);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: "#050200",
    emissive: EYES[kind],
    emissiveIntensity: 5.5,
    roughness: 0.35,
    metalness: 0.1,
  });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = 0.58;
  torso.rotation.x = 0.18;
  body.add(torso);
  torso.add(m(G.torso, skinMat, 0, 0.22, 0.04));
  const belly = m(G.belly, skinDark, 0, 0.0, 0.1);
  belly.scale.set(1.08, 0.82, 1.2);
  torso.add(belly);
  torso.add(m(G.pec, skinMat, -0.11, 0.3, -0.09), m(G.pec, skinMat, 0.11, 0.3, -0.09));
  torso.add(m(G.deltoid, skinMat, -0.26, 0.36, 0.02), m(G.deltoid, skinMat, 0.26, 0.36, 0.02));
  for (let i = 0; i < 3; i++) {
    const rib = m(G.rib, skinDark, 0, 0.08 + i * 0.07, -0.12);
    rib.scale.set(1 - i * 0.06, 1, 1);
    torso.add(rib);
  }
  for (let i = 0; i < 4; i++) {
    const bump = m(G.spine, skinDark, 0, 0.05 + i * 0.1, 0.18);
    bump.scale.set(0.8, 0.8, 1.4);
    torso.add(bump);
  }
  torso.add(m(G.loin, kind === "shaman" ? M.robe : M.hide, 0, -0.1, 0.04));
  const flapL = m(G.flap, M.hide, -0.14, -0.22, 0.02);
  flapL.rotation.z = 0.25;
  const flapR = m(G.flap, M.hide, 0.14, -0.22, 0.02);
  flapR.rotation.z = -0.25;
  torso.add(flapL, flapR);
  torso.add(m(G.wart, skinDark, -0.17, 0.18, 0.17), m(G.wart, skinDark, 0.13, 0.06, 0.2));
  torso.add(m(G.wart, skinDark, -0.05, 0.32, 0.14));

  const head = new THREE.Group();
  head.position.set(0, 0.54, -0.12);
  head.rotation.x = -0.15;
  torso.add(head);
  const skull = m(G.head, skinMat);
  skull.scale.set(0.95, 0.84, 1.08);
  head.add(skull);
  const cranium = m(G.cranium, skinDark, 0, 0.09, 0.07);
  cranium.scale.set(1.08, 0.68, 0.88);
  head.add(cranium);
  const snout = m(G.snout, skinMat, 0, -0.07, -0.22);
  snout.scale.set(0.88, 0.72, 1.4);
  head.add(snout);
  head.add(m(G.cheek, skinDark, -0.16, -0.02, -0.08), m(G.cheek, skinDark, 0.16, -0.02, -0.08));
  const earL = m(G.ear, skinMat, -0.23, 0.1, 0.04);
  earL.rotation.set(0.2, 0.25, Math.PI / 2 + 0.5);
  const earR = m(G.ear, skinMat, 0.23, 0.1, 0.04);
  earR.rotation.set(0.2, -0.25, -Math.PI / 2 - 0.5);
  const earIL = m(G.earInner, M.earPink, -0.2, 0.08, 0.02);
  earIL.rotation.copy(earL.rotation);
  earIL.scale.setScalar(0.85);
  const earIR = m(G.earInner, M.earPink, 0.2, 0.08, 0.02);
  earIR.rotation.copy(earR.rotation);
  earIR.scale.setScalar(0.85);
  head.add(earL, earR, earIL, earIR);
  const nose = m(G.nose, skinDark, 0, -0.02, -0.36);
  nose.rotation.x = -Math.PI / 2 - 0.12;
  head.add(nose);
  head.add(m(G.nostril, skinDark, -0.03, -0.04, -0.4), m(G.nostril, skinDark, 0.03, -0.04, -0.4));

  head.add(m(G.eyeWhite, M.white, -0.075, 0.05, -0.175), m(G.eyeWhite, M.white, 0.075, 0.05, -0.175));
  const eyeL = m(G.eye, eyeMat, -0.075, 0.05, -0.195);
  eyeL.scale.set(1, 0.55, 1);
  const eyeR = m(G.eye, eyeMat, 0.075, 0.05, -0.195);
  eyeR.scale.set(1, 0.55, 1);
  head.add(eyeL, eyeR);
  head.add(m(G.slit, skinDark, -0.075, 0.085, -0.2), m(G.slit, skinDark, 0.075, 0.085, -0.2));
  const browL = m(G.brow, skinDark, -0.09, 0.13, -0.17);
  browL.rotation.set(0.35, 0, -0.5);
  const browR = m(G.brow, skinDark, 0.09, 0.13, -0.17);
  browR.rotation.set(0.35, 0, 0.5);
  head.add(browL, browR);
  if (kind === "brute" || kind === "king") {
    const scar = m(G.scar, skinDark, 0.06, 0.02, -0.22);
    scar.rotation.z = -0.55;
    head.add(scar);
  }

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.15, -0.1);
  jaw.add(m(G.jaw, skinMat, 0, 0, -0.06));
  jaw.add(m(new THREE.BoxGeometry(0.22, 0.055, 0.15), M.mouth, 0, 0.055, -0.08));
  jaw.add(m(new THREE.BoxGeometry(0.2, 0.032, 0.09), M.gum, 0, 0.065, -0.1));
  const tuskScale = kind === "brute" || kind === "king" ? 2.2 : 1.4;
  for (const x of [-0.09, 0.09]) {
    const tusk = m(G.tooth, M.bone, x, 0.11, -0.17);
    tusk.scale.setScalar(tuskScale);
    tusk.rotation.x = 0.4;
    jaw.add(tusk);
  }
  for (const x of [-0.045, 0, 0.045]) {
    const fang = m(G.tooth, M.bone, x, 0.075, -0.19);
    fang.scale.set(0.65, 0.75, 0.65);
    jaw.add(fang);
  }
  head.add(jaw);

  const arm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.3, 0.34, 0.04);
    shoulder.add(m(G.upperArm, skinMat, 0, -0.22, 0));
    const elbow = new THREE.Group();
    elbow.position.y = -0.4;
    elbow.rotation.x = -0.65;
    elbow.add(m(G.foreArm, skinMat, 0, -0.2, 0));
    elbow.add(m(G.hand, skinMat, 0, -0.38, 0));
    for (let i = 0; i < 4; i++) {
      elbow.add(m(G.knuckle, skinDark, (i - 1.5) * 0.03, -0.4, -0.04));
      const claw = m(G.claw, M.bone, (i - 1.5) * 0.03, -0.48, -0.03);
      claw.rotation.x = Math.PI;
      elbow.add(claw);
    }
    shoulder.add(elbow);
    shoulder.userData.hand = elbow;
    return shoulder;
  };
  const armL = arm(-1), armR = arm(1);
  torso.add(armL, armR);

  const handR = armR.userData.hand as THREE.Group;
  const handL = armL.userData.hand as THREE.Group;
  const pole = spear(kind);
  pole.position.set(0.02, -0.22, 0.04);
  pole.rotation.set(0.15, 0, 0.08);
  handR.add(pole);
  root.userData.spear = pole;

  if (kind === "shaman") {
    handL.add(m(G.staff, M.wood, 0, -0.32, -0.02));
    const orb = m(
      G.orb,
      new THREE.MeshStandardMaterial({ color: "#000", emissive: "#a94dff", emissiveIntensity: 5, roughness: 0.2 }),
      0,
      0.42,
      -0.02,
    );
    handL.add(orb);
    root.userData.orb = orb;
    torso.add(m(G.robe, M.robe, 0, -0.28, 0.02));
  }

  if (kind === "brute" || kind === "king") {
    const metal = kind === "king" ? M.gold : M.rust;
    torso.add(m(G.plate, metal, 0, 0.24, -0.17));
    torso.add(m(G.pauldron, metal, -0.32, 0.4, 0.02));
    torso.add(m(G.pauldron, metal, 0.32, 0.4, 0.02));
  }
  if (kind === "king") {
    const crown = new THREE.Group();
    crown.position.y = 0.22;
    crown.add(m(G.crown, M.gold));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      crown.add(m(G.crownSpike, M.gold, Math.cos(a) * 0.19, 0.13, Math.sin(a) * 0.19));
    }
    head.add(crown);
  }

  const leg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, 0.52, 0.04);
    hip.add(m(G.leg, skinMat, 0, -0.22, 0.02));
    hip.add(m(G.knee, skinDark, 0, -0.38, 0.04));
    hip.add(m(G.calf, skinMat, 0, -0.48, 0.05));
    hip.add(m(G.foot, skinMat, 0, -0.62, -0.04));
    for (let i = 0; i < 3; i++) {
      const claw = m(G.claw, M.bone, (i - 1) * 0.038, -0.64, -0.18);
      claw.rotation.x = Math.PI * 0.6;
      hip.add(claw);
    }
    return hip;
  };
  const legL = leg(-1), legR = leg(1);
  body.add(legL, legR);

  return { root, body, torso, head, armL, armR, legL, legR, jaw, eyeMat, skinMat, muzzle: pole.userData.tip as THREE.Object3D };
}
