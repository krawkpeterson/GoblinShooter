import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const box = (w: number, h: number, d: number, r = 0.002) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w * 0.45, h * 0.45, d * 0.45));

export const MAT = {
  blued: new THREE.MeshStandardMaterial({ color: "#1d2024", metalness: 0.92, roughness: 0.32 }),
  bluedDark: new THREE.MeshStandardMaterial({ color: "#0e1012", metalness: 0.9, roughness: 0.45 }),
  stainless: new THREE.MeshStandardMaterial({ color: "#a7abb1", metalness: 1, roughness: 0.3 }),
  stainlessDark: new THREE.MeshStandardMaterial({ color: "#767b81", metalness: 1, roughness: 0.38 }),
  wood: new THREE.MeshStandardMaterial({ color: "#6a3518", metalness: 0, roughness: 0.45 }),
  gold: new THREE.MeshStandardMaterial({ color: "#d4a73c", metalness: 1, roughness: 0.25 }),
  rubber: new THREE.MeshStandardMaterial({ color: "#141414", metalness: 0, roughness: 0.92 }),
  brass: new THREE.MeshStandardMaterial({ color: "#d9a441", metalness: 1, roughness: 0.22 }),
  glove: new THREE.MeshStandardMaterial({ color: "#23262a", metalness: 0, roughness: 0.85 }),
  sleeve: new THREE.MeshStandardMaterial({ color: "#3c4232", metalness: 0, roughness: 0.95 }),
  skin: new THREE.MeshStandardMaterial({ color: "#c8946e", roughness: 0.7 }),
  tritium: new THREE.MeshBasicMaterial({ color: "#7dff4a" }),
  tritiumOrange: new THREE.MeshBasicMaterial({ color: "#ff9a1a" }),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export interface M1911Model {
  root: THREE.Group;
  slide: THREE.Group;
  mag: THREE.Group;
  hammer: THREE.Object3D;
  muzzle: THREE.Object3D;
  ejection: THREE.Object3D;
  sightHeight: number;
}

/** Double-stack 1911 in .45 ACP: 5" slide, wide frame, beavertail, ambi safety. */
export function buildM1911(): M1911Model {
  const root = new THREE.Group();

  const slide = new THREE.Group();
  slide.add(mesh(box(0.025, 0.03, 0.215, 0.004), MAT.blued, 0, 0.001, -0.095));
  for (let i = 0; i < 9; i++) slide.add(mesh(new THREE.BoxGeometry(0.0255, 0.022, 0.0014), MAT.bluedDark, 0, 0.002, 0.0 - i * 0.0035));
  for (let i = 0; i < 6; i++) slide.add(mesh(new THREE.BoxGeometry(0.0255, 0.018, 0.0012), MAT.bluedDark, 0, 0.002, -0.17 + i * 0.0035));
  slide.add(mesh(new THREE.BoxGeometry(0.0258, 0.009, 0.032), MAT.bluedDark, 0.0004, 0.006, -0.05)); // ejection port
  slide.add(mesh(box(0.016, 0.006, 0.01, 0.001), MAT.blued, 0, 0.019, 0.004)); // rear sight
  slide.add(mesh(new THREE.BoxGeometry(0.004, 0.006, 0.004), MAT.bluedDark, 0, 0.0205, 0.004));
  slide.add(mesh(new THREE.BoxGeometry(0.0025, 0.0025, 0.002), MAT.tritium, -0.0045, 0.019, 0.0095));
  slide.add(mesh(new THREE.BoxGeometry(0.0025, 0.0025, 0.002), MAT.tritium, 0.0045, 0.019, 0.0095));
  slide.add(mesh(box(0.0035, 0.007, 0.008, 0.001), MAT.blued, 0, 0.019, -0.196)); // front sight
  slide.add(mesh(new THREE.BoxGeometry(0.003, 0.003, 0.002), MAT.tritiumOrange, 0, 0.0205, -0.1915));
  slide.add(mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 16).rotateX(Math.PI / 2), MAT.bluedDark, 0, -0.003, -0.204)); // bushing
  slide.add(mesh(new THREE.CylinderGeometry(0.0057, 0.0057, 0.0062, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#000" }), 0, -0.003, -0.2045));
  root.add(slide);

  const frame = new THREE.Group();
  frame.add(mesh(box(0.024, 0.016, 0.14, 0.003), MAT.blued, 0, -0.019, -0.075)); // dust cover
  frame.add(mesh(box(0.012, 0.01, 0.12, 0.002), MAT.bluedDark, 0, -0.03, -0.08)); // rail
  frame.add(mesh(box(0.034, 0.03, 0.05, 0.004), MAT.blued, 0, -0.027, 0.012)); // receiver
  const beaver = mesh(box(0.028, 0.008, 0.032, 0.003), MAT.blued, 0, -0.012, 0.035);
  beaver.rotation.x = -0.25;
  frame.add(beaver);
  frame.add(mesh(box(0.004, 0.006, 0.014, 0.001), MAT.blued, 0.018, -0.012, 0.012)); // safety R
  frame.add(mesh(box(0.004, 0.006, 0.014, 0.001), MAT.blued, -0.018, -0.012, 0.012)); // safety L
  frame.add(mesh(box(0.004, 0.008, 0.016, 0.001), MAT.blued, -0.0145, -0.022, -0.035)); // slide stop
  const guard = mesh(new THREE.TorusGeometry(0.019, 0.0028, 8, 20, Math.PI), MAT.blued, 0, -0.036, -0.022);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  frame.add(guard);
  frame.add(mesh(box(0.004, 0.012, 0.004, 0.001), MAT.gold, 0, -0.042, -0.012)); // trigger
  root.add(frame);

  const grip = new THREE.Group();
  grip.position.set(0, -0.035, 0.022);
  grip.rotation.x = -0.32;
  grip.add(mesh(box(0.032, 0.11, 0.052, 0.006), MAT.bluedDark, 0, -0.05, 0));
  grip.add(mesh(box(0.0355, 0.088, 0.04, 0.005), MAT.wood, 0, -0.048, -0.001));
  for (let i = 0; i < 4; i++) grip.add(mesh(new THREE.BoxGeometry(0.0358, 0.003, 0.03), new THREE.MeshStandardMaterial({ color: "#4a2410", roughness: 0.6 }), 0, -0.02 - i * 0.018, 0));
  grip.add(mesh(box(0.026, 0.004, 0.022, 0.001), MAT.gold, 0, -0.06, 0.028)); // checkered strap
  root.add(grip);

  const mag = new THREE.Group();
  mag.add(mesh(box(0.024, 0.11, 0.036, 0.003), MAT.blued, 0, -0.05, 0));
  mag.add(mesh(box(0.03, 0.012, 0.046, 0.003), MAT.rubber, 0, -0.108, 0.002));
  mag.add(mesh(new THREE.CylinderGeometry(0.0057, 0.0057, 0.02, 10).rotateX(Math.PI / 2), MAT.brass, 0, 0.004, 0));
  grip.add(mag);

  const hammer = new THREE.Group();
  hammer.position.set(0, -0.004, 0.03);
  hammer.add(mesh(box(0.008, 0.016, 0.008, 0.002), MAT.blued, 0, 0.006, 0.002));
  root.add(hammer);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.003, -0.215);
  root.add(muzzle);
  const ejection = new THREE.Object3D();
  ejection.position.set(0.014, 0.008, -0.05);
  root.add(ejection);

  return { root, slide, mag, hammer, muzzle, ejection, sightHeight: 0.0215 };
}

export interface AnacondaModel {
  root: THREE.Group;
  cylinderPivot: THREE.Group;
  cylinder: THREE.Group;
  hammer: THREE.Group;
  speedloader: THREE.Group;
  muzzle: THREE.Object3D;
  sightHeight: number;
}

/** Colt Anaconda, 6" .44 Magnum: full underlug, vent rib, fluted 6-shot cylinder. */
export function buildAnaconda(): AnacondaModel {
  const root = new THREE.Group();
  const S = MAT.stainless, D = MAT.stainlessDark;

  root.add(mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.155, 20).rotateX(Math.PI / 2), S, 0, 0, -0.17)); // barrel
  root.add(mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.156, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#050505" }), 0, 0, -0.1705)); // bore
  root.add(mesh(box(0.021, 0.02, 0.155, 0.004), S, 0, -0.012, -0.17)); // underlug
  root.add(mesh(box(0.014, 0.007, 0.155, 0.002), S, 0, 0.012, -0.17)); // vent rib
  for (let i = 0; i < 9; i++) root.add(mesh(new THREE.BoxGeometry(0.0145, 0.004, 0.006), D, 0, 0.011, -0.235 + i * 0.016));
  root.add(mesh(box(0.004, 0.012, 0.018, 0.001), S, 0, 0.019, -0.236)); // front ramp
  root.add(mesh(new THREE.BoxGeometry(0.0042, 0.003, 0.004), MAT.tritiumOrange, 0, 0.0245, -0.232));
  root.add(mesh(box(0.024, 0.006, 0.006, 0.001), S, 0, -0.019, -0.246)); // ejector rod housing tip

  root.add(mesh(box(0.02, 0.012, 0.075, 0.003), S, 0, 0.018, -0.052)); // top strap
  root.add(mesh(box(0.02, 0.05, 0.022, 0.004), S, 0, -0.008, -0.096)); // frame front
  root.add(mesh(box(0.022, 0.05, 0.04, 0.004), S, 0, -0.012, 0.0)); // frame rear
  root.add(mesh(box(0.012, 0.007, 0.012, 0.001), D, 0, 0.026, -0.005)); // rear sight
  root.add(mesh(new THREE.BoxGeometry(0.003, 0.0025, 0.002), MAT.tritium, -0.0042, 0.026, 0.0015));
  root.add(mesh(new THREE.BoxGeometry(0.003, 0.0025, 0.002), MAT.tritium, 0.0042, 0.026, 0.0015));
  root.add(mesh(box(0.006, 0.01, 0.012, 0.001), D, -0.013, -0.006, -0.012)); // cylinder latch
  const guard = mesh(new THREE.TorusGeometry(0.02, 0.003, 8, 20, Math.PI), S, 0, -0.037, -0.03);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  root.add(guard);
  root.add(mesh(box(0.005, 0.016, 0.005, 0.002), S, 0, -0.044, -0.022)); // trigger

  const cylinderPivot = new THREE.Group();
  cylinderPivot.position.set(-0.012, -0.03, -0.06);
  root.add(cylinderPivot);
  const cylinder = new THREE.Group();
  cylinder.position.set(0.012, 0.0165, 0);
  cylinderPivot.add(cylinder);
  cylinder.add(mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.058, 24).rotateX(Math.PI / 2), S));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const flute = mesh(box(0.006, 0.004, 0.04, 0.0015), D, Math.cos(a) * 0.022, Math.sin(a) * 0.022, -0.004);
    flute.rotation.z = a;
    cylinder.add(flute);
    const ch = (i / 6) * Math.PI * 2 + Math.PI / 2;
    cylinder.add(mesh(new THREE.CylinderGeometry(0.0058, 0.0058, 0.0025, 10).rotateX(Math.PI / 2), MAT.brass, Math.cos(ch) * 0.0135, Math.sin(ch) * 0.0135, 0.029));
  }
  cylinder.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 8).rotateX(Math.PI / 2), D, 0, 0, -0.04)); // ejector rod

  const hammer = new THREE.Group();
  hammer.position.set(0, 0.006, 0.022);
  hammer.add(mesh(box(0.008, 0.02, 0.01, 0.002), S, 0, 0.008, 0));
  hammer.add(mesh(box(0.012, 0.004, 0.014, 0.001), D, 0, 0.018, 0.006));
  root.add(hammer);

  const grip = new THREE.Group();
  grip.position.set(0, -0.032, 0.03);
  grip.rotation.x = -0.36;
  grip.add(mesh(box(0.034, 0.105, 0.05, 0.012), MAT.rubber, 0, -0.048, 0));
  for (let i = 0; i < 3; i++) grip.add(mesh(box(0.0352, 0.012, 0.012, 0.005), MAT.rubber, 0, -0.03 - i * 0.022, -0.024));
  grip.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0362, 12).rotateZ(Math.PI / 2), MAT.gold, 0, -0.045, 0.002)); // medallion
  root.add(grip);

  const speedloader = new THREE.Group();
  speedloader.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.014, 18).rotateX(Math.PI / 2), MAT.rubber, 0, 0, 0.012));
  for (let i = 0; i < 6; i++) {
    const ch = (i / 6) * Math.PI * 2 + Math.PI / 2;
    speedloader.add(mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.04, 10).rotateX(Math.PI / 2), MAT.brass, Math.cos(ch) * 0.0135, Math.sin(ch) * 0.0135, -0.012));
  }
  speedloader.visible = false;
  root.add(speedloader);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.25);
  root.add(muzzle);

  return { root, cylinderPivot, cylinder, hammer, speedloader, muzzle, sightHeight: 0.0255 };
}

/** Ruger Old Army: cap-and-ball .44, brass frame, octagon barrel, rammer. */
export function buildRugerOldArmy(): AnacondaModel {
  const root = new THREE.Group();
  const B = MAT.brass, S = MAT.blued, D = MAT.bluedDark;

  const oct = new THREE.CylinderGeometry(0.011, 0.011, 0.19, 8).rotateX(Math.PI / 2);
  root.add(mesh(oct, S, 0, 0.002, -0.185));
  root.add(mesh(new THREE.CylinderGeometry(0.0058, 0.0058, 0.192, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#050505" }), 0, 0.002, -0.185));
  root.add(mesh(box(0.008, 0.01, 0.17, 0.001), S, 0, -0.01, -0.175)); // rammer housing
  const ram = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 8).rotateX(Math.PI / 2), D, 0, -0.016, -0.16);
  root.add(ram);
  root.add(mesh(box(0.01, 0.008, 0.016, 0.002), B, 0, -0.016, -0.09)); // rammer lever
  root.add(mesh(box(0.004, 0.012, 0.014, 0.001), S, 0, 0.016, -0.275)); // front sight
  root.add(mesh(new THREE.BoxGeometry(0.003, 0.003, 0.002), MAT.tritiumOrange, 0, 0.021, -0.27));

  root.add(mesh(box(0.024, 0.048, 0.038, 0.004), B, 0, -0.01, -0.002)); // brass frame
  root.add(mesh(box(0.022, 0.014, 0.07, 0.003), B, 0, 0.016, -0.05)); // top strap
  root.add(mesh(box(0.012, 0.006, 0.01, 0.001), D, 0, 0.024, -0.004));
  const guard = mesh(new THREE.TorusGeometry(0.019, 0.0026, 8, 18, Math.PI), B, 0, -0.036, -0.028);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  root.add(guard);
  root.add(mesh(box(0.004, 0.014, 0.004, 0.001), S, 0, -0.042, -0.02));

  const cylinderPivot = new THREE.Group();
  cylinderPivot.position.set(-0.012, -0.028, -0.055);
  root.add(cylinderPivot);
  const cylinder = new THREE.Group();
  cylinder.position.set(0.012, 0.016, 0);
  cylinderPivot.add(cylinder);
  cylinder.add(mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.05, 20).rotateX(Math.PI / 2), S));
  for (let i = 0; i < 6; i++) {
    const ch = (i / 6) * Math.PI * 2 + Math.PI / 2;
    cylinder.add(mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.003, 8).rotateX(Math.PI / 2), MAT.brass, Math.cos(ch) * 0.013, Math.sin(ch) * 0.013, 0.026));
    cylinder.add(mesh(new THREE.SphereGeometry(0.0032, 8, 6), MAT.brass, Math.cos(ch) * 0.013, Math.sin(ch) * 0.013, -0.024));
  }

  const hammer = new THREE.Group();
  hammer.position.set(0, 0.008, 0.02);
  hammer.add(mesh(box(0.007, 0.022, 0.012, 0.002), S, 0, 0.01, 0.002));
  hammer.add(mesh(box(0.012, 0.004, 0.012, 0.001), D, 0, 0.02, 0.006));
  root.add(hammer);

  const grip = new THREE.Group();
  grip.position.set(0, -0.03, 0.028);
  grip.rotation.x = -0.4;
  grip.add(mesh(box(0.032, 0.1, 0.046, 0.012), MAT.wood, 0, -0.05, 0));
  grip.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.034, 10).rotateZ(Math.PI / 2), B, 0, -0.048, 0));
  root.add(grip);

  const speedloader = new THREE.Group();
  speedloader.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 16).rotateX(Math.PI / 2), MAT.wood, 0, 0, 0.01));
  for (let i = 0; i < 6; i++) {
    const ch = (i / 6) * Math.PI * 2 + Math.PI / 2;
    speedloader.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.028, 8).rotateX(Math.PI / 2), MAT.brass, Math.cos(ch) * 0.013, Math.sin(ch) * 0.013, -0.01));
  }
  speedloader.visible = false;
  root.add(speedloader);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.002, -0.28);
  root.add(muzzle);
  return { root, cylinderPivot, cylinder, hammer, speedloader, muzzle, sightHeight: 0.024 };
}

export interface WinchesterModel {
  root: THREE.Group;
  pump: THREE.Group;
  hammer: THREE.Group;
  muzzle: THREE.Object3D;
  ejection: THREE.Object3D;
  sightHeight: number;
}

/** Winchester Model 12 pump shotgun, 12 gauge, takedown receiver. */
export function buildWinchester12(): WinchesterModel {
  const root = new THREE.Group();
  const W = MAT.wood, S = MAT.blued, D = MAT.bluedDark;

  root.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.32, 16).rotateX(Math.PI / 2), S, 0, 0.01, -0.26));
  root.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.322, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#050505" }), 0, 0.01, -0.26));
  root.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.26, 12).rotateX(Math.PI / 2), S, 0, -0.008, -0.2)); // mag tube
  root.add(mesh(box(0.006, 0.008, 0.01, 0.001), S, 0, 0.022, -0.41)); // bead
  root.add(mesh(new THREE.BoxGeometry(0.003, 0.003, 0.002), MAT.tritiumOrange, 0, 0.026, -0.406));

  root.add(mesh(box(0.028, 0.038, 0.11, 0.004), S, 0, 0.0, -0.04)); // receiver
  root.add(mesh(box(0.026, 0.016, 0.08, 0.002), D, 0, 0.018, -0.04));
  root.add(mesh(box(0.018, 0.012, 0.04, 0.002), S, 0.012, 0.004, -0.02)); // ejection port lip

  const pump = new THREE.Group();
  pump.position.set(0, -0.01, -0.16);
  pump.add(mesh(box(0.032, 0.028, 0.09, 0.01), W, 0, 0, 0));
  for (let i = 0; i < 5; i++) pump.add(mesh(new THREE.BoxGeometry(0.033, 0.004, 0.012), new THREE.MeshStandardMaterial({ color: "#4a2410", roughness: 0.7 }), 0, -0.006 + i * 0.006, 0));
  root.add(pump);

  const stock = new THREE.Group();
  stock.position.set(0, -0.02, 0.08);
  stock.rotation.x = -0.12;
  stock.add(mesh(box(0.034, 0.04, 0.16, 0.008), W, 0, 0.002, 0.06));
  stock.add(mesh(box(0.036, 0.07, 0.04, 0.008), W, 0, -0.01, 0.14)); // butt
  stock.add(mesh(box(0.02, 0.018, 0.05, 0.004), W, 0, -0.018, 0.02)); // wrist
  root.add(stock);

  const guard = mesh(new THREE.TorusGeometry(0.016, 0.0024, 8, 16, Math.PI), S, 0, -0.028, -0.02);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  root.add(guard);
  root.add(mesh(box(0.004, 0.014, 0.008, 0.001), S, 0, -0.032, -0.014));

  const hammer = new THREE.Group();
  hammer.position.set(0, 0.016, 0.02);
  hammer.add(mesh(box(0.006, 0.012, 0.01, 0.001), D, 0, 0.004, 0));
  root.add(hammer);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -0.42);
  root.add(muzzle);
  const ejection = new THREE.Object3D();
  ejection.position.set(0.016, 0.008, -0.02);
  root.add(ejection);
  return { root, pump, hammer, muzzle, ejection, sightHeight: 0.022 };
}

/** Gloved shooting hands in a thumbs-forward two-hand grip. */
export function buildHands(): { right: THREE.Group; left: THREE.Group } {
  const right = new THREE.Group();
  right.add(mesh(box(0.044, 0.085, 0.062, 0.016), MAT.glove, 0.002, -0.07, 0.03));
  const thumb = mesh(box(0.016, 0.016, 0.05, 0.007), MAT.glove, 0.02, -0.03, -0.004);
  thumb.rotation.y = 0.1;
  right.add(thumb);
  const fore = mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.32, 10), MAT.sleeve, 0.06, -0.15, 0.2);
  fore.rotation.set(1.1, 0, 0.35);
  right.add(fore);
  right.add(mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.03, 10).rotateX(1.1), MAT.glove, 0.025, -0.095, 0.07));

  const left = new THREE.Group();
  left.add(mesh(box(0.04, 0.07, 0.062, 0.016), MAT.glove, -0.03, -0.075, 0.018));
  const lthumb = mesh(box(0.015, 0.015, 0.05, 0.007), MAT.glove, -0.02, -0.03, -0.012);
  lthumb.rotation.y = -0.12;
  left.add(lthumb);
  const lfore = mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.32, 10), MAT.sleeve, -0.12, -0.16, 0.19);
  lfore.rotation.set(1.05, 0, -0.55);
  left.add(lfore);
  return { right, left };
}
