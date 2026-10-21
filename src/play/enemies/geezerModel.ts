import * as THREE from "three";
import type { GoblinRig } from "./goblinModel.ts";

const G = {
  torso: new THREE.CapsuleGeometry(0.15, 0.4, 5, 12),
  chest: new THREE.SphereGeometry(0.155, 14, 12),
  hip: new THREE.SphereGeometry(0.165, 12, 10),
  head: new THREE.SphereGeometry(0.165, 18, 14),
  cheek: new THREE.SphereGeometry(0.055, 10, 8),
  nose: new THREE.SphereGeometry(0.026, 8, 6),
  eye: new THREE.SphereGeometry(0.03, 10, 8),
  makeup: new THREE.SphereGeometry(0.058, 10, 8),
  brow: new THREE.BoxGeometry(0.11, 0.016, 0.028),
  jaw: new THREE.BoxGeometry(0.18, 0.05, 0.11),
  arm: new THREE.CapsuleGeometry(0.04, 0.28, 3, 8),
  hand: new THREE.SphereGeometry(0.042, 8, 6),
  leg: new THREE.CapsuleGeometry(0.052, 0.44, 3, 8),
  foot: new THREE.BoxGeometry(0.1, 0.075, 0.24),
  bang: new THREE.BoxGeometry(0.08, 0.22, 0.05),
  strand: new THREE.CapsuleGeometry(0.025, 0.28, 2, 6),
  hoodie: new THREE.ConeGeometry(0.27, 0.55, 12, 1, true),
  hood: new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
};

const shared = {
  skin: new THREE.MeshLambertMaterial({ color: "#f3e4d8" }),
  pale: new THREE.MeshLambertMaterial({ color: "#fff4ea", emissive: "#2a1838", emissiveIntensity: 0.12 }),
  makeup: new THREE.MeshLambertMaterial({ color: "#050508" }),
  lipstick: new THREE.MeshLambertMaterial({ color: "#4a0818" }),
  hair: new THREE.MeshLambertMaterial({ color: "#0a0a10" }),
  hoodie: new THREE.MeshLambertMaterial({ color: "#1a1228", side: THREE.DoubleSide }),
  tee: new THREE.MeshLambertMaterial({ color: "#111118" }),
  jeans: new THREE.MeshLambertMaterial({ color: "#1c1c2a" }),
  boot: new THREE.MeshLambertMaterial({ color: "#0c0c10" }),
  choker: new THREE.MeshLambertMaterial({ color: "#09090c" }),
  ring: new THREE.MeshStandardMaterial({ color: "#c0c4cc", metalness: 0.9, roughness: 0.3 }),
};

function m(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** College emo girl: pale, raccoon liner, choppy black hair, skinny jeans, no gun. */
export function buildGeezer(): GoblinRig {
  const eyeMat = new THREE.MeshStandardMaterial({
    color: "#1a1028",
    emissive: "#c45cff",
    emissiveIntensity: 2.6,
    roughness: 0.4,
  });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = 0.98;
  body.add(torso);
  torso.add(m(G.torso, shared.tee, 0, 0.08, 0));
  const chest = m(G.chest, shared.tee, 0, 0.18, 0.02);
  chest.scale.set(1.18, 0.68, 0.82);
  torso.add(chest);
  const hips = m(G.hip, shared.jeans, 0, -0.2, 0);
  hips.scale.set(1.18, 0.52, 0.88);
  torso.add(hips);
  const skirt = m(G.hoodie, shared.hoodie, 0, -0.1, 0);
  skirt.rotation.x = Math.PI;
  skirt.scale.set(1.05, 0.52, 1.05);
  torso.add(skirt);

  const head = new THREE.Group();
  head.position.set(0, 0.46, 0);
  torso.add(head);
  const skull = m(G.head, shared.pale);
  skull.scale.set(0.9, 1.1, 0.94);
  head.add(skull);
  head.add(m(G.cheek, shared.skin, -0.12, -0.02, -0.06), m(G.cheek, shared.skin, 0.12, -0.02, -0.06));

  const bagsL = m(G.makeup, shared.makeup, -0.058, 0.04, -0.14);
  bagsL.scale.set(1.55, 1.25, 0.5);
  const bagsR = m(G.makeup, shared.makeup, 0.058, 0.04, -0.14);
  bagsR.scale.set(1.55, 1.25, 0.5);
  head.add(bagsL, bagsR);
  const tearL = m(new THREE.BoxGeometry(0.016, 0.11, 0.014), shared.makeup, -0.058, -0.055, -0.155);
  tearL.rotation.z = 0.12;
  const tearR = m(new THREE.BoxGeometry(0.014, 0.09, 0.014), shared.makeup, 0.068, -0.045, -0.155);
  tearR.rotation.z = -0.18;
  head.add(tearL, tearR);

  head.add(m(G.eye, eyeMat, -0.052, 0.05, -0.158), m(G.eye, eyeMat, 0.052, 0.05, -0.158));
  const browL = m(G.brow, shared.makeup, -0.058, 0.115, -0.148);
  browL.rotation.z = 0.38;
  const browR = m(G.brow, shared.makeup, 0.058, 0.115, -0.148);
  browR.rotation.z = -0.38;
  head.add(browL, browR);
  head.add(m(G.nose, shared.skin, 0, 0.0, -0.178));
  head.add(m(new THREE.TorusGeometry(0.068, 0.011, 6, 18), shared.choker, 0, -0.17, 0));

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.125, -0.02);
  jaw.add(m(G.jaw, shared.skin, 0, 0, -0.03));
  jaw.add(m(new THREE.BoxGeometry(0.11, 0.026, 0.055), shared.lipstick, 0, 0.014, -0.075));
  head.add(jaw);

  const bangs = new THREE.Group();
  bangs.position.set(-0.02, 0.15, -0.12);
  for (let i = 0; i < 9; i++) {
    const strand = m(G.bang, shared.hair, (i - 4) * 0.026, -0.05 - (i % 3) * 0.028, 0);
    strand.scale.set(0.45, 1.2 + (i % 2) * 0.45, 0.35);
    strand.rotation.set(0.45, 0, (i - 4) * 0.09);
    bangs.add(strand);
  }
  head.add(bangs);
  const mop = m(new THREE.SphereGeometry(0.185, 14, 12), shared.hair, 0.02, 0.1, 0.05);
  mop.scale.set(1.18, 0.72, 1.22);
  head.add(mop);
  for (let i = 0; i < 5; i++) {
    const side = m(G.strand, shared.hair, -0.15 - (i % 2) * 0.02, -0.06 - i * 0.04, 0.02 + (i % 3) * 0.01);
    side.rotation.z = 0.15;
    head.add(side);
    const sideR = m(G.strand, shared.hair, 0.15 + (i % 2) * 0.02, -0.04 - i * 0.035, 0.02);
    sideR.rotation.z = -0.12;
    head.add(sideR);
  }
  const hood = m(G.hood, shared.hoodie, 0, 0.06, 0.08);
  hood.scale.set(1.15, 0.85, 1.1);
  hood.rotation.x = 0.35;
  head.add(hood);

  const arm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.22, 0.22, 0);
    shoulder.add(m(G.arm, shared.hoodie, 0, -0.18, 0));
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    elbow.rotation.x = -0.35;
    elbow.add(m(G.arm, shared.hoodie, 0, -0.14, 0));
    elbow.add(m(G.hand, shared.skin, 0, -0.3, 0));
    elbow.add(m(new THREE.TorusGeometry(0.038, 0.007, 5, 12), shared.choker, 0, -0.26, 0));
    if (side > 0) elbow.add(m(new THREE.TorusGeometry(0.03, 0.005, 5, 10), shared.ring, 0.01, -0.28, 0.02));
    shoulder.add(elbow);
    shoulder.userData.hand = elbow;
    return shoulder;
  };
  const armL = arm(-1), armR = arm(1);
  torso.add(armL, armR);

  const leg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09, 0.78, 0);
    hip.add(m(G.leg, shared.jeans, 0, -0.34, 0));
    const boot = m(G.foot, shared.boot, 0, -0.64, -0.04);
    boot.scale.set(1, 1.15, 1.1);
    hip.add(boot);
    return hip;
  };
  const legL = leg(-1), legR = leg(1);
  body.add(legL, legR);

  return { root, body, torso, head, armL, armR, legL, legR, jaw, eyeMat, skinMat: shared.skin };
}
