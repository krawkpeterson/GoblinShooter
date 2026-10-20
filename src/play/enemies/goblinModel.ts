import * as THREE from "three";

export type GoblinKind = "grunt" | "runner" | "brute" | "shaman" | "king";
export type HostileKind = GoblinKind | "geezer";
export type Faction = "goblin" | "geezer";

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
  skinMat: THREE.MeshStandardMaterial;
  muzzle?: THREE.Object3D;
}

const G = {
  torso: new THREE.CapsuleGeometry(0.22, 0.38, 5, 12),
  belly: new THREE.SphereGeometry(0.22, 12, 10),
  pec: new THREE.SphereGeometry(0.12, 10, 8),
  head: new THREE.SphereGeometry(0.22, 18, 14),
  snout: new THREE.SphereGeometry(0.14, 12, 10),
  cranium: new THREE.SphereGeometry(0.18, 12, 10),
  ear: new THREE.ConeGeometry(0.07, 0.5, 7),
  nose: new THREE.ConeGeometry(0.045, 0.16, 6),
  eye: new THREE.SphereGeometry(0.032, 10, 8),
  slit: new THREE.BoxGeometry(0.09, 0.016, 0.02),
  brow: new THREE.BoxGeometry(0.14, 0.04, 0.07),
  jaw: new THREE.BoxGeometry(0.28, 0.1, 0.22),
  tooth: new THREE.ConeGeometry(0.02, 0.1, 5),
  upperArm: new THREE.CapsuleGeometry(0.07, 0.3, 3, 8),
  foreArm: new THREE.CapsuleGeometry(0.055, 0.28, 3, 8),
  hand: new THREE.SphereGeometry(0.07, 8, 6),
  claw: new THREE.ConeGeometry(0.016, 0.09, 4),
  leg: new THREE.CapsuleGeometry(0.085, 0.3, 3, 8),
  calf: new THREE.CapsuleGeometry(0.07, 0.22, 3, 8),
  foot: new THREE.BoxGeometry(0.13, 0.06, 0.28),
  loin: new THREE.CylinderGeometry(0.24, 0.3, 0.16, 10),
  wart: new THREE.SphereGeometry(0.035, 6, 5),
  shaft: new THREE.CylinderGeometry(0.018, 0.024, 1.55, 7),
  blade: new THREE.ConeGeometry(0.045, 0.32, 4),
  guard: new THREE.BoxGeometry(0.12, 0.02, 0.04),
  plate: new THREE.BoxGeometry(0.48, 0.34, 0.08),
  shoulder: new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  crown: new THREE.CylinderGeometry(0.18, 0.2, 0.1, 8, 1, true),
  crownSpike: new THREE.ConeGeometry(0.035, 0.16, 4),
  robe: new THREE.ConeGeometry(0.34, 0.78, 10, 1, true),
  staff: new THREE.CylinderGeometry(0.022, 0.03, 1.5, 6),
  orb: new THREE.IcosahedronGeometry(0.1, 1),
};

const M = {
  cloth: new THREE.MeshStandardMaterial({ color: "#3a2416", roughness: 1 }),
  hide: new THREE.MeshStandardMaterial({ color: "#2a1a10", roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: "#3d2814", roughness: 0.9 }),
  bone: new THREE.MeshStandardMaterial({ color: "#e4d4b4", roughness: 0.45 }),
  steel: new THREE.MeshStandardMaterial({ color: "#6e7380", metalness: 0.85, roughness: 0.28 }),
  rust: new THREE.MeshStandardMaterial({ color: "#5a4234", metalness: 0.55, roughness: 0.72 }),
  gold: new THREE.MeshStandardMaterial({ color: "#d4a020", metalness: 1, roughness: 0.28, emissive: "#3a2400" }),
  robe: new THREE.MeshStandardMaterial({ color: "#2a1438", roughness: 0.9, side: THREE.DoubleSide }),
  mouth: new THREE.MeshStandardMaterial({ color: "#1a0504", roughness: 1 }),
  gum: new THREE.MeshStandardMaterial({ color: "#5a1810", roughness: 0.7 }),
};

const SKIN: Record<GoblinKind, string> = {
  grunt: "#4a6b28", runner: "#6a7a2a", brute: "#3a5420", shaman: "#5a7038", king: "#2e4a18",
};
const EYES: Record<GoblinKind, string> = {
  grunt: "#ff2208", runner: "#ffb008", brute: "#ff1040", shaman: "#c040ff", king: "#ff6a00",
};

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
  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN[kind], roughness: 0.78, metalness: 0.04 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#050200", emissive: EYES[kind], emissiveIntensity: 5.5 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = 0.58;
  torso.rotation.x = 0.28;
  body.add(torso);
  torso.add(m(G.torso, skinMat, 0, 0.22, 0.04));
  const belly = m(G.belly, skinMat, 0, 0.02, 0.08);
  belly.scale.set(1.05, 0.85, 1.15);
  torso.add(belly);
  torso.add(m(G.pec, skinMat, -0.1, 0.28, -0.08), m(G.pec, skinMat, 0.1, 0.28, -0.08));
  torso.add(m(G.loin, kind === "shaman" ? M.robe : M.hide, 0, -0.08, 0.04));
  torso.add(m(G.wart, skinMat, -0.16, 0.18, 0.16), m(G.wart, skinMat, 0.12, 0.08, 0.18));

  const head = new THREE.Group();
  head.position.set(0, 0.52, -0.12);
  head.rotation.x = -0.15;
  torso.add(head);
  const skull = m(G.head, skinMat);
  skull.scale.set(0.95, 0.82, 1.05);
  head.add(skull);
  const cranium = m(G.cranium, skinMat, 0, 0.08, 0.06);
  cranium.scale.set(1.05, 0.7, 0.85);
  head.add(cranium);
  const snout = m(G.snout, skinMat, 0, -0.06, -0.2);
  snout.scale.set(0.85, 0.7, 1.35);
  head.add(snout);
  const earL = m(G.ear, skinMat, -0.22, 0.08, 0.04);
  earL.rotation.set(0.15, 0.2, Math.PI / 2 + 0.55);
  const earR = m(G.ear, skinMat, 0.22, 0.08, 0.04);
  earR.rotation.set(0.15, -0.2, -Math.PI / 2 - 0.55);
  head.add(earL, earR);
  const nose = m(G.nose, skinMat, 0, -0.02, -0.34);
  nose.rotation.x = -Math.PI / 2 - 0.15;
  head.add(nose);
  const eyeL = m(G.eye, eyeMat, -0.07, 0.05, -0.18);
  eyeL.scale.set(1, 0.55, 1);
  const eyeR = m(G.eye, eyeMat, 0.07, 0.05, -0.18);
  eyeR.scale.set(1, 0.55, 1);
  head.add(eyeL, eyeR);
  head.add(m(G.slit, skinMat, -0.07, 0.08, -0.19), m(G.slit, skinMat, 0.07, 0.08, -0.19));
  const browL = m(G.brow, skinMat, -0.08, 0.12, -0.16);
  browL.rotation.set(0.3, 0, -0.55);
  const browR = m(G.brow, skinMat, 0.08, 0.12, -0.16);
  browR.rotation.set(0.3, 0, 0.55);
  head.add(browL, browR);

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.14, -0.1);
  jaw.add(m(G.jaw, skinMat, 0, 0, -0.06));
  jaw.add(m(new THREE.BoxGeometry(0.2, 0.05, 0.14), M.mouth, 0, 0.05, -0.08));
  jaw.add(m(new THREE.BoxGeometry(0.18, 0.03, 0.08), M.gum, 0, 0.06, -0.1));
  const tuskScale = kind === "brute" || kind === "king" ? 2.1 : 1.35;
  for (const x of [-0.08, 0.08]) {
    const tusk = m(G.tooth, M.bone, x, 0.1, -0.16);
    tusk.scale.setScalar(tuskScale);
    tusk.rotation.x = 0.35;
    jaw.add(tusk);
  }
  for (const x of [-0.04, 0.04]) {
    const fang = m(G.tooth, M.bone, x, 0.07, -0.18);
    fang.scale.set(0.7, 0.8, 0.7);
    jaw.add(fang);
  }
  head.add(jaw);

  const arm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.28, 0.34, 0.04);
    shoulder.add(m(G.upperArm, skinMat, 0, -0.2, 0));
    const elbow = new THREE.Group();
    elbow.position.y = -0.38;
    elbow.rotation.x = -0.65;
    elbow.add(m(G.foreArm, skinMat, 0, -0.18, 0));
    const hand = m(G.hand, skinMat, 0, -0.36, 0);
    elbow.add(hand);
    for (let i = 0; i < 4; i++) {
      const claw = m(G.claw, M.bone, (i - 1.5) * 0.028, -0.44, -0.02);
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
  pole.position.set(0.02, -0.2, 0.04);
  pole.rotation.set(0.15, 0, 0.08);
  handR.add(pole);
  root.userData.spear = pole;

  if (kind === "shaman") {
    const staff = m(G.staff, M.wood, 0, -0.32, -0.02);
    handL.add(staff);
    const orb = m(G.orb, new THREE.MeshStandardMaterial({ color: "#000", emissive: "#a94dff", emissiveIntensity: 5 }), 0, 0.42, -0.02);
    handL.add(orb);
    root.userData.orb = orb;
    torso.add(m(G.robe, M.robe, 0, -0.28, 0.02));
  }

  if (kind === "brute" || kind === "king") {
    torso.add(m(G.plate, kind === "king" ? M.gold : M.rust, 0, 0.24, -0.16));
    torso.add(m(G.shoulder, kind === "king" ? M.gold : M.rust, -0.3, 0.38, 0.02));
    torso.add(m(G.shoulder, kind === "king" ? M.gold : M.rust, 0.3, 0.38, 0.02));
  }
  if (kind === "king") {
    const crown = new THREE.Group();
    crown.position.y = 0.2;
    crown.add(m(G.crown, M.gold));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      crown.add(m(G.crownSpike, M.gold, Math.cos(a) * 0.18, 0.12, Math.sin(a) * 0.18));
    }
    head.add(crown);
  }

  const leg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0.52, 0.04);
    hip.add(m(G.leg, skinMat, 0, -0.22, 0.02));
    hip.add(m(G.calf, skinMat, 0, -0.46, 0.04));
    const foot = m(G.foot, skinMat, 0, -0.6, -0.04);
    for (let i = 0; i < 3; i++) {
      const claw = m(G.claw, M.bone, (i - 1) * 0.035, -0.62, -0.16);
      claw.rotation.x = Math.PI * 0.6;
      hip.add(claw);
    }
    hip.add(foot);
    return hip;
  };
  const legL = leg(-1), legR = leg(1);
  body.add(legL, legR);

  return { root, body, torso, head, armL, armR, legL, legR, jaw, eyeMat, skinMat, muzzle: pole.userData.tip as THREE.Object3D };
}
