import * as THREE from "three";
import type { GoblinRig } from "./goblinModel.ts";

const G = {
  torso: new THREE.CapsuleGeometry(0.16, 0.38, 4, 10),
  chest: new THREE.SphereGeometry(0.15, 12, 10),
  hip: new THREE.SphereGeometry(0.16, 12, 10),
  head: new THREE.SphereGeometry(0.17, 16, 12),
  nose: new THREE.SphereGeometry(0.028, 8, 6),
  eye: new THREE.SphereGeometry(0.032, 10, 8),
  makeup: new THREE.SphereGeometry(0.055, 10, 8),
  brow: new THREE.BoxGeometry(0.11, 0.018, 0.03),
  jaw: new THREE.BoxGeometry(0.2, 0.055, 0.12),
  arm: new THREE.CapsuleGeometry(0.042, 0.26, 3, 8),
  hand: new THREE.SphereGeometry(0.045, 8, 6),
  leg: new THREE.CapsuleGeometry(0.055, 0.42, 3, 8),
  foot: new THREE.BoxGeometry(0.1, 0.08, 0.22),
  bang: new THREE.BoxGeometry(0.09, 0.2, 0.06),
  hoodie: new THREE.ConeGeometry(0.26, 0.52, 10, 1, true),
};

function m(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** College emo girl: pale, raccoon liner, choppy black hair, skinny jeans, no gun. */
export function buildGeezer(): GoblinRig {
  const skinMat = new THREE.MeshStandardMaterial({ color: "#f3e4d8", roughness: 0.48 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#1a1028", emissive: "#c45cff", emissiveIntensity: 2.6 });
  const makeup = new THREE.MeshStandardMaterial({ color: "#050508", roughness: 0.35 });
  const lipstick = new THREE.MeshStandardMaterial({ color: "#4a0818", roughness: 0.22 });
  const hair = new THREE.MeshStandardMaterial({ color: "#0a0a10", roughness: 0.55 });
  const hoodie = new THREE.MeshStandardMaterial({ color: "#1a1228", roughness: 0.86, side: THREE.DoubleSide });
  const tee = new THREE.MeshStandardMaterial({ color: "#111118", roughness: 0.9 });
  const jeans = new THREE.MeshStandardMaterial({ color: "#1c1c2a", roughness: 0.88 });
  const boot = new THREE.MeshStandardMaterial({ color: "#0c0c10", roughness: 0.7 });
  const pale = new THREE.MeshStandardMaterial({ color: "#fff4ea", roughness: 0.4, emissive: "#2a1838", emissiveIntensity: 0.18 });
  const choker = new THREE.MeshStandardMaterial({ color: "#09090c", roughness: 0.5 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = 0.98;
  body.add(torso);
  torso.add(m(G.torso, tee, 0, 0.08, 0));
  const chest = m(G.chest, tee, 0, 0.16, 0.02);
  chest.scale.set(1.15, 0.7, 0.85);
  torso.add(chest);
  const hips = m(G.hip, jeans, 0, -0.18, 0);
  hips.scale.set(1.15, 0.55, 0.9);
  torso.add(hips);
  const skirt = m(G.hoodie, hoodie, 0, -0.08, 0);
  skirt.rotation.x = Math.PI;
  skirt.scale.set(1, 0.55, 1);
  torso.add(skirt);

  const head = new THREE.Group();
  head.position.set(0, 0.44, 0);
  torso.add(head);
  const skull = m(G.head, pale);
  skull.scale.set(0.92, 1.08, 0.95);
  head.add(skull);

  const bagsL = m(G.makeup, makeup, -0.06, 0.04, -0.14);
  bagsL.scale.set(1.5, 1.2, 0.55);
  const bagsR = m(G.makeup, makeup, 0.06, 0.04, -0.14);
  bagsR.scale.set(1.5, 1.2, 0.55);
  head.add(bagsL, bagsR);
  const tearL = m(new THREE.BoxGeometry(0.018, 0.1, 0.016), makeup, -0.06, -0.05, -0.155);
  tearL.rotation.z = 0.12;
  const tearR = m(new THREE.BoxGeometry(0.016, 0.08, 0.016), makeup, 0.07, -0.04, -0.155);
  tearR.rotation.z = -0.18;
  head.add(tearL, tearR);

  head.add(m(G.eye, eyeMat, -0.055, 0.05, -0.155), m(G.eye, eyeMat, 0.055, 0.05, -0.155));
  const browL = m(G.brow, makeup, -0.06, 0.11, -0.145);
  browL.rotation.z = 0.35;
  const browR = m(G.brow, makeup, 0.06, 0.11, -0.145);
  browR.rotation.z = -0.35;
  head.add(browL, browR);
  head.add(m(G.nose, skinMat, 0, 0.0, -0.175));
  head.add(m(new THREE.TorusGeometry(0.07, 0.012, 6, 16), choker, 0, -0.16, 0));

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, -0.02);
  jaw.add(m(G.jaw, skinMat, 0, 0, -0.03));
  jaw.add(m(new THREE.BoxGeometry(0.12, 0.028, 0.06), lipstick, 0, 0.015, -0.08));
  head.add(jaw);

  const bangs = new THREE.Group();
  bangs.position.set(-0.02, 0.14, -0.12);
  for (let i = 0; i < 8; i++) {
    const strand = m(G.bang, hair, (i - 3.5) * 0.028, -0.04 - (i % 3) * 0.03, 0);
    strand.scale.set(0.5, 1.15 + (i % 2) * 0.4, 0.4);
    strand.rotation.set(0.4, 0, (i - 3.5) * 0.1);
    bangs.add(strand);
  }
  head.add(bangs);
  const mop = m(new THREE.SphereGeometry(0.18, 12, 10), hair, 0.02, 0.1, 0.04);
  mop.scale.set(1.15, 0.75, 1.2);
  head.add(mop);
  const sideL = m(new THREE.BoxGeometry(0.07, 0.22, 0.08), hair, -0.16, -0.02, 0.02);
  const sideR = m(new THREE.BoxGeometry(0.07, 0.18, 0.08), hair, 0.16, 0.0, 0.02);
  head.add(sideL, sideR);

  const arm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.22, 0.22, 0);
    shoulder.add(m(G.arm, hoodie, 0, -0.18, 0));
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    elbow.rotation.x = -0.35;
    elbow.add(m(G.arm, hoodie, 0, -0.14, 0));
    elbow.add(m(G.hand, skinMat, 0, -0.3, 0));
    elbow.add(m(new THREE.TorusGeometry(0.04, 0.008, 5, 10), choker, 0, -0.26, 0));
    shoulder.add(elbow);
    shoulder.userData.hand = elbow;
    return shoulder;
  };
  const armL = arm(-1), armR = arm(1);
  torso.add(armL, armR);

  const leg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09, 0.78, 0);
    hip.add(m(G.leg, jeans, 0, -0.34, 0));
    hip.add(m(G.foot, boot, 0, -0.62, -0.03));
    return hip;
  };
  const legL = leg(-1), legR = leg(1);
  body.add(legL, legR);

  return { root, body, torso, head, armL, armR, legL, legR, jaw, eyeMat, skinMat };
}
