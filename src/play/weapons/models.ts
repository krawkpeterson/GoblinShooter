import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const box = (w: number, h: number, d: number, r = 0.002) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w * 0.4, h * 0.4, d * 0.4));

export const MAT = {
  blued: new THREE.MeshStandardMaterial({ color: "#1a1d22", metalness: 0.96, roughness: 0.22, envMapIntensity: 1.35 }),
  bluedDark: new THREE.MeshStandardMaterial({ color: "#0a0b0d", metalness: 0.94, roughness: 0.38, envMapIntensity: 1.1 }),
  stainless: new THREE.MeshStandardMaterial({ color: "#c4c8ce", metalness: 1, roughness: 0.18, envMapIntensity: 1.5 }),
  stainlessDark: new THREE.MeshStandardMaterial({ color: "#7a8088", metalness: 1, roughness: 0.32, envMapIntensity: 1.2 }),
  wood: new THREE.MeshStandardMaterial({ color: "#6e3a1c", metalness: 0.05, roughness: 0.55, envMapIntensity: 0.35 }),
  woodDark: new THREE.MeshStandardMaterial({ color: "#3a1c0c", metalness: 0.02, roughness: 0.72 }),
  gold: new THREE.MeshStandardMaterial({ color: "#e0b34a", metalness: 1, roughness: 0.18, envMapIntensity: 1.4 }),
  rubber: new THREE.MeshStandardMaterial({ color: "#101012", metalness: 0.05, roughness: 0.94 }),
  brass: new THREE.MeshStandardMaterial({ color: "#e0ae48", metalness: 1, roughness: 0.16, envMapIntensity: 1.3 }),
  glove: new THREE.MeshStandardMaterial({ color: "#1c1f24", metalness: 0.08, roughness: 0.88 }),
  sleeve: new THREE.MeshStandardMaterial({ color: "#353b2e", metalness: 0, roughness: 0.96 }),
  skin: new THREE.MeshStandardMaterial({ color: "#c8946e", roughness: 0.7 }),
  tritium: new THREE.MeshBasicMaterial({ color: "#8dff55" }),
  tritiumOrange: new THREE.MeshBasicMaterial({ color: "#ff9a1a" }),
  bore: new THREE.MeshBasicMaterial({ color: "#030303" }),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function serrations(parent: THREE.Object3D, count: number, z0: number, step: number, mat: THREE.Material, y = 0.002, h = 0.02) {
  for (let i = 0; i < count; i++) parent.add(mesh(new THREE.BoxGeometry(0.0262, h, 0.0015), mat, 0, y, z0 - i * step));
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
  slide.add(mesh(box(0.026, 0.032, 0.218, 0.0035), MAT.blued, 0, 0.002, -0.095));
  serrations(slide, 10, 0.002, 0.0034, MAT.bluedDark, 0.003, 0.022);
  serrations(slide, 7, -0.168, 0.0034, MAT.bluedDark, 0.003, 0.018);
  slide.add(mesh(new THREE.BoxGeometry(0.0262, 0.01, 0.034), MAT.bluedDark, 0.0005, 0.007, -0.05));
  slide.add(mesh(box(0.017, 0.007, 0.011, 0.001), MAT.blued, 0, 0.02, 0.005));
  slide.add(mesh(new THREE.BoxGeometry(0.0045, 0.0065, 0.004), MAT.bluedDark, 0, 0.0215, 0.005));
  slide.add(mesh(new THREE.BoxGeometry(0.0026, 0.0026, 0.002), MAT.tritium, -0.005, 0.02, 0.0105));
  slide.add(mesh(new THREE.BoxGeometry(0.0026, 0.0026, 0.002), MAT.tritium, 0.005, 0.02, 0.0105));
  slide.add(mesh(box(0.0038, 0.008, 0.009, 0.001), MAT.blued, 0, 0.02, -0.198));
  slide.add(mesh(new THREE.BoxGeometry(0.0032, 0.0032, 0.002), MAT.tritiumOrange, 0, 0.0218, -0.193));
  slide.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.007, 20).rotateX(Math.PI / 2), MAT.bluedDark, 0, -0.002, -0.206));
  slide.add(mesh(new THREE.CylinderGeometry(0.0058, 0.0058, 0.007, 16).rotateX(Math.PI / 2), MAT.bore, 0, -0.002, -0.2065));
  slide.add(mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.15, 12).rotateX(Math.PI / 2), MAT.bluedDark, 0, -0.002, -0.12));
  root.add(slide);

  const frame = new THREE.Group();
  frame.add(mesh(box(0.025, 0.017, 0.142, 0.003), MAT.blued, 0, -0.018, -0.075));
  frame.add(mesh(box(0.013, 0.01, 0.122, 0.002), MAT.bluedDark, 0, -0.029, -0.08));
  frame.add(mesh(box(0.035, 0.031, 0.052, 0.004), MAT.blued, 0, -0.026, 0.012));
  const beaver = mesh(box(0.029, 0.009, 0.034, 0.003), MAT.blued, 0, -0.011, 0.036);
  beaver.rotation.x = -0.28;
  frame.add(beaver);
  frame.add(mesh(box(0.0045, 0.007, 0.015, 0.001), MAT.blued, 0.019, -0.011, 0.012));
  frame.add(mesh(box(0.0045, 0.007, 0.015, 0.001), MAT.blued, -0.019, -0.011, 0.012));
  frame.add(mesh(box(0.0045, 0.009, 0.017, 0.001), MAT.blued, -0.015, -0.021, -0.035));
  const guard = mesh(new THREE.TorusGeometry(0.02, 0.003, 10, 24, Math.PI), MAT.blued, 0, -0.036, -0.022);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  frame.add(guard);
  frame.add(mesh(box(0.0045, 0.014, 0.005, 0.001), MAT.gold, 0, -0.043, -0.012));
  root.add(frame);

  const grip = new THREE.Group();
  grip.position.set(0, -0.035, 0.022);
  grip.rotation.x = -0.32;
  grip.add(mesh(box(0.033, 0.112, 0.054, 0.006), MAT.bluedDark, 0, -0.05, 0));
  grip.add(mesh(box(0.0365, 0.09, 0.042, 0.005), MAT.wood, 0, -0.048, -0.001));
  for (let i = 0; i < 6; i++) {
    grip.add(mesh(new THREE.BoxGeometry(0.0368, 0.0025, 0.032), MAT.woodDark, 0, -0.018 - i * 0.012, 0));
    grip.add(mesh(new THREE.BoxGeometry(0.0025, 0.07, 0.032), MAT.woodDark, -0.014 + (i % 2) * 0.028, -0.048, 0));
  }
  grip.add(mesh(box(0.027, 0.005, 0.024, 0.001), MAT.gold, 0, -0.06, 0.028));
  root.add(grip);

  const mag = new THREE.Group();
  mag.add(mesh(box(0.025, 0.112, 0.037, 0.003), MAT.blued, 0, -0.05, 0));
  mag.add(mesh(box(0.031, 0.013, 0.048, 0.003), MAT.rubber, 0, -0.11, 0.002));
  mag.add(mesh(new THREE.CylinderGeometry(0.0058, 0.0058, 0.022, 12).rotateX(Math.PI / 2), MAT.brass, 0, 0.005, 0));
  grip.add(mag);

  const hammer = new THREE.Group();
  hammer.position.set(0, -0.003, 0.031);
  hammer.add(mesh(box(0.009, 0.018, 0.01, 0.002), MAT.blued, 0, 0.007, 0.002));
  hammer.add(mesh(box(0.012, 0.004, 0.012, 0.001), MAT.bluedDark, 0, 0.015, 0.006));
  root.add(hammer);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.002, -0.218);
  root.add(muzzle);
  const ejection = new THREE.Object3D();
  ejection.position.set(0.014, 0.008, -0.05);
  root.add(ejection);

  return { root, slide, mag, hammer, muzzle, ejection, sightHeight: 0.022 };
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

  root.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.158, 24).rotateX(Math.PI / 2), S, 0, 0, -0.172));
  root.add(mesh(new THREE.CylinderGeometry(0.0064, 0.0064, 0.159, 14).rotateX(Math.PI / 2), MAT.bore, 0, 0, -0.1725));
  root.add(mesh(box(0.022, 0.021, 0.158, 0.0035), S, 0, -0.012, -0.172));
  root.add(mesh(box(0.015, 0.008, 0.158, 0.002), S, 0, 0.013, -0.172));
  for (let i = 0; i < 11; i++) root.add(mesh(new THREE.BoxGeometry(0.0152, 0.0045, 0.006), D, 0, 0.012, -0.24 + i * 0.015));
  root.add(mesh(box(0.0045, 0.013, 0.02, 0.001), S, 0, 0.02, -0.24));
  root.add(mesh(new THREE.BoxGeometry(0.0044, 0.0032, 0.004), MAT.tritiumOrange, 0, 0.0255, -0.235));
  root.add(mesh(box(0.025, 0.007, 0.007, 0.001), S, 0, -0.02, -0.25));
  root.add(mesh(new THREE.CylinderGeometry(0.0135, 0.011, 0.012, 20).rotateX(Math.PI / 2), S, 0, 0, -0.09));

  root.add(mesh(box(0.021, 0.013, 0.078, 0.003), S, 0, 0.019, -0.052));
  root.add(mesh(box(0.021, 0.052, 0.024, 0.004), S, 0, -0.007, -0.098));
  root.add(mesh(box(0.023, 0.052, 0.042, 0.004), S, 0, -0.011, 0.0));
  root.add(mesh(box(0.013, 0.008, 0.013, 0.001), D, 0, 0.027, -0.004));
  root.add(mesh(new THREE.BoxGeometry(0.0032, 0.0026, 0.002), MAT.tritium, -0.0045, 0.027, 0.002));
  root.add(mesh(new THREE.BoxGeometry(0.0032, 0.0026, 0.002), MAT.tritium, 0.0045, 0.027, 0.002));
  root.add(mesh(box(0.007, 0.011, 0.014, 0.001), D, -0.014, -0.005, -0.012));
  const guard = mesh(new THREE.TorusGeometry(0.021, 0.0032, 10, 24, Math.PI), S, 0, -0.038, -0.03);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  root.add(guard);
  root.add(mesh(box(0.0055, 0.017, 0.006, 0.002), S, 0, -0.045, -0.022));

  const cylinderPivot = new THREE.Group();
  cylinderPivot.position.set(-0.012, -0.03, -0.06);
  root.add(cylinderPivot);
  const cylinder = new THREE.Group();
  cylinder.position.set(0.012, 0.0165, 0);
  cylinderPivot.add(cylinder);
  cylinder.add(mesh(new THREE.CylinderGeometry(0.0245, 0.0245, 0.06, 28).rotateX(Math.PI / 2), S));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const flute = mesh(box(0.007, 0.005, 0.042, 0.0015), D, Math.cos(a) * 0.023, Math.sin(a) * 0.023, -0.004);
    flute.rotation.z = a;
    cylinder.add(flute);
    const ch = (i / 6) * Math.PI * 2 + Math.PI / 2;
    cylinder.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.003, 12).rotateX(Math.PI / 2), MAT.brass, Math.cos(ch) * 0.014, Math.sin(ch) * 0.014, 0.03));
    cylinder.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.002, 10).rotateX(Math.PI / 2), MAT.bore, Math.cos(ch) * 0.014, Math.sin(ch) * 0.014, 0.0315));
  }
  cylinder.add(mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.095, 10).rotateX(Math.PI / 2), D, 0, 0, -0.04));

  const hammer = new THREE.Group();
  hammer.position.set(0, 0.006, 0.022);
  hammer.add(mesh(box(0.009, 0.022, 0.012, 0.002), S, 0, 0.009, 0));
  hammer.add(mesh(box(0.014, 0.005, 0.015, 0.001), D, 0, 0.019, 0.006));
  for (let i = 0; i < 4; i++) hammer.add(mesh(new THREE.BoxGeometry(0.0145, 0.0012, 0.01), D, 0, 0.017 + i * 0.002, 0.008));
  root.add(hammer);

  const grip = new THREE.Group();
  grip.position.set(0, -0.032, 0.03);
  grip.rotation.x = -0.36;
  grip.add(mesh(box(0.036, 0.108, 0.052, 0.012), MAT.rubber, 0, -0.048, 0));
  for (let i = 0; i < 5; i++) grip.add(mesh(box(0.037, 0.01, 0.01, 0.004), MAT.rubber, 0, -0.028 - i * 0.016, -0.024));
  grip.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.038, 16).rotateZ(Math.PI / 2), MAT.gold, 0, -0.045, 0.002));
  root.add(grip);

  const speedloader = new THREE.Group();
  speedloader.add(mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.015, 20).rotateX(Math.PI / 2), MAT.rubber, 0, 0, 0.012));
  for (let i = 0; i < 6; i++) {
    const ch = (i / 6) * Math.PI * 2 + Math.PI / 2;
    speedloader.add(mesh(new THREE.CylinderGeometry(0.0056, 0.0056, 0.042, 12).rotateX(Math.PI / 2), MAT.brass, Math.cos(ch) * 0.014, Math.sin(ch) * 0.014, -0.012));
  }
  speedloader.visible = false;
  root.add(speedloader);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.252);
  root.add(muzzle);

  return { root, cylinderPivot, cylinder, hammer, speedloader, muzzle, sightHeight: 0.026 };
}

/** Ruger Redhawk .44 Magnum: stainless, unfluted cylinder, 5.5" barrel. */
export function buildRugerRedhawk(): AnacondaModel {
  const root = new THREE.Group();
  const S = MAT.stainless, D = MAT.stainlessDark;

  root.add(mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.148, 24).rotateX(Math.PI / 2), S, 0, 0, -0.166));
  root.add(mesh(new THREE.CylinderGeometry(0.0066, 0.0066, 0.149, 14).rotateX(Math.PI / 2), MAT.bore, 0, 0, -0.1665));
  root.add(mesh(box(0.023, 0.019, 0.148, 0.003), S, 0, -0.012, -0.166));
  root.add(mesh(box(0.015, 0.007, 0.148, 0.001), S, 0, 0.014, -0.166));
  root.add(mesh(box(0.0045, 0.013, 0.017, 0.001), S, 0, 0.021, -0.23));
  root.add(mesh(new THREE.BoxGeometry(0.0042, 0.0032, 0.003), MAT.tritiumOrange, 0, 0.026, -0.226));
  root.add(mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.014, 20).rotateX(Math.PI / 2), S, 0, 0, -0.088));

  root.add(mesh(box(0.028, 0.056, 0.05, 0.005), S, 0, -0.007, 0.0));
  root.add(mesh(box(0.023, 0.017, 0.074, 0.003), S, 0, 0.019, -0.05));
  root.add(mesh(box(0.023, 0.05, 0.03, 0.004), S, 0, -0.009, -0.09));
  root.add(mesh(box(0.013, 0.008, 0.013, 0.001), D, 0, 0.028, -0.003));
  root.add(mesh(new THREE.BoxGeometry(0.0032, 0.0026, 0.002), MAT.tritium, -0.0042, 0.028, 0.003));
  root.add(mesh(new THREE.BoxGeometry(0.0032, 0.0026, 0.002), MAT.tritium, 0.0042, 0.028, 0.003));
  const guard = mesh(new THREE.TorusGeometry(0.022, 0.0032, 10, 24, Math.PI), S, 0, -0.039, -0.028);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  root.add(guard);
  root.add(mesh(box(0.0055, 0.017, 0.007, 0.002), S, 0, -0.046, -0.02));
  root.add(mesh(box(0.008, 0.013, 0.015, 0.001), D, -0.015, -0.003, -0.01));

  const cylinderPivot = new THREE.Group();
  cylinderPivot.position.set(-0.012, -0.03, -0.058);
  root.add(cylinderPivot);
  const cylinder = new THREE.Group();
  cylinder.position.set(0.012, 0.017, 0);
  cylinderPivot.add(cylinder);
  cylinder.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.064, 28).rotateX(Math.PI / 2), S));
  for (let i = 0; i < 6; i++) {
    const ch = (i / 6) * Math.PI * 2 + Math.PI / 2;
    cylinder.add(mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.0035, 12).rotateX(Math.PI / 2), MAT.brass, Math.cos(ch) * 0.0145, Math.sin(ch) * 0.0145, 0.033));
    cylinder.add(mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.002, 10).rotateX(Math.PI / 2), MAT.bore, Math.cos(ch) * 0.0145, Math.sin(ch) * 0.0145, 0.0345));
  }
  cylinder.add(mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.085, 10).rotateX(Math.PI / 2), D, 0, 0, -0.03));

  const hammer = new THREE.Group();
  hammer.position.set(0, 0.008, 0.024);
  hammer.add(mesh(box(0.009, 0.024, 0.013, 0.002), S, 0, 0.011, 0));
  hammer.add(mesh(box(0.015, 0.0055, 0.015, 0.001), D, 0, 0.021, 0.006));
  root.add(hammer);

  const grip = new THREE.Group();
  grip.position.set(0, -0.032, 0.032);
  grip.rotation.x = -0.34;
  grip.add(mesh(box(0.038, 0.112, 0.054, 0.012), MAT.wood, 0, -0.05, 0));
  for (let i = 0; i < 5; i++) grip.add(mesh(new THREE.BoxGeometry(0.0385, 0.0028, 0.04), MAT.woodDark, 0, -0.02 - i * 0.014, 0));
  grip.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.04, 16).rotateZ(Math.PI / 2), MAT.gold, 0, -0.048, 0.002));
  root.add(grip);

  const speedloader = new THREE.Group();
  speedloader.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.015, 20).rotateX(Math.PI / 2), MAT.rubber, 0, 0, 0.012));
  for (let i = 0; i < 6; i++) {
    const ch = (i / 6) * Math.PI * 2 + Math.PI / 2;
    speedloader.add(mesh(new THREE.CylinderGeometry(0.0056, 0.0056, 0.042, 12).rotateX(Math.PI / 2), MAT.brass, Math.cos(ch) * 0.0145, Math.sin(ch) * 0.0145, -0.012));
  }
  speedloader.visible = false;
  root.add(speedloader);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.242);
  root.add(muzzle);
  return { root, cylinderPivot, cylinder, hammer, speedloader, muzzle, sightHeight: 0.027 };
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

  root.add(mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.325, 20).rotateX(Math.PI / 2), S, 0, 0.01, -0.262));
  root.add(mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.327, 14).rotateX(Math.PI / 2), MAT.bore, 0, 0.01, -0.262));
  root.add(mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.265, 14).rotateX(Math.PI / 2), S, 0, -0.008, -0.2));
  root.add(mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.012, 16).rotateX(Math.PI / 2), D, 0, -0.008, -0.065));
  root.add(mesh(box(0.0065, 0.009, 0.011, 0.001), S, 0, 0.023, -0.415));
  root.add(mesh(new THREE.BoxGeometry(0.0032, 0.0032, 0.002), MAT.tritiumOrange, 0, 0.027, -0.41));

  root.add(mesh(box(0.03, 0.04, 0.115, 0.004), S, 0, 0.0, -0.04));
  root.add(mesh(box(0.028, 0.017, 0.085, 0.002), D, 0, 0.019, -0.04));
  root.add(mesh(box(0.02, 0.014, 0.042, 0.002), S, 0.013, 0.005, -0.02));
  root.add(mesh(box(0.004, 0.02, 0.06, 0.001), D, 0.015, 0.004, -0.03));

  const pump = new THREE.Group();
  pump.position.set(0, -0.01, -0.16);
  pump.add(mesh(box(0.034, 0.03, 0.095, 0.01), W, 0, 0, 0));
  for (let i = 0; i < 7; i++) pump.add(mesh(new THREE.BoxGeometry(0.035, 0.0035, 0.012), MAT.woodDark, 0, -0.008 + i * 0.005, 0));
  root.add(pump);

  const stock = new THREE.Group();
  stock.position.set(0, -0.02, 0.08);
  stock.rotation.x = -0.12;
  stock.add(mesh(box(0.036, 0.042, 0.165, 0.008), W, 0, 0.002, 0.06));
  stock.add(mesh(box(0.038, 0.074, 0.045, 0.008), W, 0, -0.01, 0.145));
  stock.add(mesh(box(0.022, 0.02, 0.055, 0.004), W, 0, -0.018, 0.02));
  stock.add(mesh(box(0.039, 0.078, 0.012, 0.002), MAT.rubber, 0, -0.01, 0.168));
  root.add(stock);

  const guard = mesh(new THREE.TorusGeometry(0.017, 0.0026, 10, 20, Math.PI), S, 0, -0.029, -0.02);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  root.add(guard);
  root.add(mesh(box(0.0045, 0.015, 0.009, 0.001), S, 0, -0.033, -0.014));

  const hammer = new THREE.Group();
  hammer.position.set(0, 0.017, 0.02);
  hammer.add(mesh(box(0.007, 0.014, 0.012, 0.001), D, 0, 0.005, 0));
  root.add(hammer);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -0.425);
  root.add(muzzle);
  const ejection = new THREE.Object3D();
  ejection.position.set(0.017, 0.008, -0.02);
  root.add(ejection);
  return { root, pump, hammer, muzzle, ejection, sightHeight: 0.023 };
}

export interface PrecisionModel {
  root: THREE.Group;
  bolt: THREE.Group;
  mag: THREE.Group;
  muzzle: THREE.Object3D;
  ejection: THREE.Object3D;
  sightHeight: number;
}

/** Ruger Precision–style bolt rifle: chassis, long free-float barrel, optic. */
export function buildPrecisionRifle(): PrecisionModel {
  const root = new THREE.Group();
  const S = MAT.blued, D = MAT.bluedDark, R = MAT.rubber, C = MAT.stainlessDark;

  root.add(mesh(new THREE.CylinderGeometry(0.009, 0.0095, 0.52, 18).rotateX(Math.PI / 2), S, 0, 0.018, -0.38));
  root.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.522, 12).rotateX(Math.PI / 2), MAT.bore, 0, 0.018, -0.38));
  root.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.055, 16).rotateX(Math.PI / 2), D, 0, 0.018, -0.62));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    root.add(mesh(new THREE.BoxGeometry(0.004, 0.018, 0.05), D, Math.cos(a) * 0.012, 0.018 + Math.sin(a) * 0.012, -0.62));
  }
  root.add(mesh(box(0.034, 0.042, 0.2, 0.003), S, 0, 0.01, -0.02));
  root.add(mesh(box(0.028, 0.016, 0.16, 0.002), D, 0, 0.028, -0.02));
  root.add(mesh(box(0.048, 0.028, 0.28, 0.004), R, 0, -0.02, -0.12));
  for (let i = 0; i < 8; i++) root.add(mesh(new THREE.BoxGeometry(0.05, 0.004, 0.012), C, 0, -0.01, -0.22 - i * 0.028));

  const bolt = new THREE.Group();
  bolt.position.set(0.012, 0.028, 0.02);
  bolt.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 12).rotateX(Math.PI / 2), C, 0, 0, -0.02));
  const handle = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.055, 10), C, 0.03, 0.01, 0.01);
  handle.rotation.z = -0.85;
  bolt.add(handle);
  bolt.add(mesh(new THREE.SphereGeometry(0.009, 10, 8), R, 0.052, 0.028, 0.01));
  root.add(bolt);

  const mag = new THREE.Group();
  mag.position.set(0, -0.04, -0.02);
  mag.add(mesh(box(0.024, 0.085, 0.055, 0.003), D, 0, -0.02, 0));
  root.add(mag);

  root.add(mesh(box(0.022, 0.04, 0.12, 0.004), R, 0, -0.01, 0.12));
  root.add(mesh(box(0.036, 0.055, 0.03, 0.003), R, 0, 0.0, 0.2));
  const stock = mesh(box(0.03, 0.045, 0.14, 0.005), R, 0, 0.005, 0.28);
  stock.rotation.x = -0.08;
  root.add(stock);
  root.add(mesh(box(0.032, 0.06, 0.014, 0.002), R, 0, 0.0, 0.35));

  // Scope
  root.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 14).rotateX(Math.PI / 2), D, 0, 0.055, -0.08));
  root.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 14).rotateX(Math.PI / 2), C, 0, 0.055, -0.16));
  root.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 14).rotateX(Math.PI / 2), C, 0, 0.055, 0.0));
  root.add(mesh(box(0.012, 0.012, 0.02, 0.001), S, 0, 0.04, -0.1));
  root.add(mesh(box(0.012, 0.012, 0.02, 0.001), S, 0, 0.04, -0.04));

  const guard = mesh(new THREE.TorusGeometry(0.016, 0.0024, 8, 16, Math.PI), S, 0, -0.022, 0.04);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  root.add(guard);
  root.add(mesh(box(0.004, 0.014, 0.01, 0.001), S, 0, -0.028, 0.045));

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.018, -0.65);
  root.add(muzzle);
  const ejection = new THREE.Object3D();
  ejection.position.set(0.02, 0.03, 0.0);
  root.add(ejection);
  return { root, bolt, mag, muzzle, ejection, sightHeight: 0.055 };
}

export interface M60Model {
  root: THREE.Group;
  bolt: THREE.Group;
  mag: THREE.Group;
  muzzle: THREE.Object3D;
  ejection: THREE.Object3D;
  sightHeight: number;
}

/** M60 machine gun: heavy receiver, bipod, box feed, ventilated barrel. */
export function buildM60(): M60Model {
  const root = new THREE.Group();
  const S = MAT.blued, D = MAT.bluedDark, R = MAT.rubber, C = MAT.stainlessDark;

  root.add(mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.42, 16).rotateX(Math.PI / 2), S, 0, 0.02, -0.32));
  root.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.422, 10).rotateX(Math.PI / 2), MAT.bore, 0, 0.02, -0.32));
  for (let i = 0; i < 10; i++) {
    root.add(mesh(new THREE.TorusGeometry(0.014, 0.002, 6, 12), C, 0, 0.02, -0.18 - i * 0.028));
  }
  root.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 12).rotateX(Math.PI / 2), D, 0, 0.02, -0.52));

  root.add(mesh(box(0.05, 0.055, 0.22, 0.004), S, 0, 0.005, -0.02));
  root.add(mesh(box(0.042, 0.02, 0.18, 0.002), D, 0, 0.032, -0.02));
  root.add(mesh(box(0.028, 0.035, 0.06, 0.003), S, 0, 0.045, 0.04));

  const bolt = new THREE.Group();
  bolt.position.set(0, 0.03, 0.02);
  bolt.add(mesh(box(0.02, 0.018, 0.05, 0.002), C, 0, 0, 0));
  root.add(bolt);

  const mag = new THREE.Group();
  mag.position.set(0.04, -0.02, -0.02);
  mag.add(mesh(box(0.055, 0.07, 0.09, 0.004), D, 0, 0, 0));
  mag.add(mesh(box(0.05, 0.01, 0.085, 0.002), R, 0, 0.035, 0));
  root.add(mag);

  // Carry handle
  const handle = mesh(new THREE.TorusGeometry(0.035, 0.004, 8, 16, Math.PI), S, 0, 0.06, -0.08);
  handle.rotation.z = Math.PI / 2;
  root.add(handle);

  // Bipod
  const bipod = new THREE.Group();
  bipod.position.set(0, -0.02, -0.35);
  for (const side of [-1, 1]) {
    const leg = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 8), C, side * 0.04, -0.05, 0);
    leg.rotation.z = side * 0.45;
    bipod.add(leg);
    bipod.add(mesh(box(0.02, 0.006, 0.03, 0.002), R, side * 0.07, -0.11, 0));
  }
  root.add(bipod);

  root.add(mesh(box(0.04, 0.05, 0.16, 0.006), R, 0, -0.015, 0.14));
  root.add(mesh(box(0.042, 0.07, 0.02, 0.003), R, 0, -0.01, 0.24));
  const grip = mesh(box(0.028, 0.055, 0.04, 0.005), R, 0, -0.04, 0.06);
  grip.rotation.x = 0.35;
  root.add(grip);
  const tg = mesh(new THREE.TorusGeometry(0.018, 0.0025, 8, 14, Math.PI), S, 0, -0.05, 0.05);
  tg.rotation.set(0, Math.PI / 2, Math.PI);
  root.add(tg);

  root.add(mesh(box(0.01, 0.012, 0.02, 0.001), S, 0, 0.045, -0.45));
  root.add(mesh(new THREE.BoxGeometry(0.004, 0.004, 0.003), MAT.tritiumOrange, 0, 0.052, -0.445));

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.55);
  root.add(muzzle);
  const ejection = new THREE.Object3D();
  ejection.position.set(0.03, 0.02, 0.0);
  root.add(ejection);
  return { root, bolt, mag, muzzle, ejection, sightHeight: 0.045 };
}

/** Gloved shooting hands in a thumbs-forward two-hand grip. */
export function buildHands(): { right: THREE.Group; left: THREE.Group } {
  const right = new THREE.Group();
  right.add(mesh(box(0.046, 0.088, 0.064, 0.016), MAT.glove, 0.002, -0.07, 0.03));
  const thumb = mesh(box(0.017, 0.017, 0.052, 0.007), MAT.glove, 0.021, -0.03, -0.004);
  thumb.rotation.y = 0.1;
  right.add(thumb);
  for (let i = 0; i < 4; i++) {
    const f = mesh(box(0.01, 0.012, 0.028, 0.004), MAT.glove, -0.012 + i * 0.01, -0.055, -0.02);
    f.rotation.x = 0.35;
    right.add(f);
  }
  const fore = mesh(new THREE.CylinderGeometry(0.031, 0.039, 0.32, 12), MAT.sleeve, 0.06, -0.15, 0.2);
  fore.rotation.set(1.1, 0, 0.35);
  right.add(fore);
  right.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.032, 12).rotateX(1.1), MAT.glove, 0.025, -0.095, 0.07));

  const left = new THREE.Group();
  left.add(mesh(box(0.042, 0.072, 0.064, 0.016), MAT.glove, -0.03, -0.075, 0.018));
  const lthumb = mesh(box(0.016, 0.016, 0.052, 0.007), MAT.glove, -0.02, -0.03, -0.012);
  lthumb.rotation.y = -0.12;
  left.add(lthumb);
  const lfore = mesh(new THREE.CylinderGeometry(0.031, 0.039, 0.32, 12), MAT.sleeve, -0.12, -0.16, 0.19);
  lfore.rotation.set(1.05, 0, -0.55);
  left.add(lfore);
  return { right, left };
}
