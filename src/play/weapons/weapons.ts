import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { AudioEngine, GunKind } from "../audio/audio.ts";
import type { Input } from "../engine/input.ts";
import type { Player } from "../player/player.ts";
import { buildAnaconda, buildHands, buildM1911, buildRugerRedhawk, buildWinchester12, type AnacondaModel, type M1911Model, type WinchesterModel } from "./models.ts";

export type LoadoutId = 0 | 1;
export const LOADOUTS: { id: LoadoutId; guns: [GunKind, GunKind]; title: string }[] = [
  { id: 0, guns: ["m1911", "anaconda"], title: "ALPHA" },
  { id: 1, guns: ["ruger", "winchester"], title: "BRAVO" },
];

export interface WeaponDef {
  id: GunKind;
  name: string;
  sub: string;
  mag: number;
  reserve: number;
  damage: number;
  headMult: number;
  interval: number;
  spreadHip: number;
  spreadAds: number;
  reload: number;
  reloadEmpty: number;
  penetration: number;
  recoil: { pitch: number; yaw: number; trauma: number; fov: number; back: number; rot: number };
  adsFov: number;
  range: number;
  pellets?: number;
}

export const WEAPONS: Record<GunKind, WeaponDef> = {
  m1911: {
    id: "m1911",
    name: "M1911 DOUBLE-STACK",
    sub: ".45 ACP · 230gr FMJ · 14+1",
    mag: 14,
    reserve: Infinity,
    damage: 58,
    headMult: 2.5,
    interval: 0.095,
    spreadHip: 0.014,
    spreadAds: 0.0025,
    reload: 1.5,
    reloadEmpty: 2.0,
    penetration: 1,
    recoil: { pitch: 0.032, yaw: 0.012, trauma: 0.14, fov: 1.5, back: 0.045, rot: 0.32 },
    adsFov: 58,
    range: 160,
  },
  anaconda: {
    id: "anaconda",
    name: "COLT ANACONDA",
    sub: ".44 MAGNUM · 240gr JHP · 6 ROUNDS",
    mag: 6,
    reserve: 36,
    damage: 160,
    headMult: 2.5,
    interval: 0.42,
    spreadHip: 0.018,
    spreadAds: 0.0012,
    reload: 2.6,
    reloadEmpty: 2.6,
    penetration: 4,
    recoil: { pitch: 0.12, yaw: 0.03, trauma: 0.5, fov: 7, back: 0.11, rot: 0.85 },
    adsFov: 48,
    range: 260,
  },
  ruger: {
    id: "ruger",
    name: "RUGER REDHAWK",
    sub: ".44 MAGNUM · 6 RDS · DA/SA",
    mag: 6,
    reserve: 36,
    damage: 145,
    headMult: 2.5,
    interval: 0.48,
    spreadHip: 0.016,
    spreadAds: 0.002,
    reload: 2.8,
    reloadEmpty: 2.8,
    penetration: 3,
    recoil: { pitch: 0.11, yaw: 0.028, trauma: 0.46, fov: 6, back: 0.1, rot: 0.78 },
    adsFov: 50,
    range: 220,
  },
  winchester: {
    id: "winchester",
    name: "WINCHESTER MODEL 12",
    sub: "12 GAUGE · 6+1 PUMP",
    mag: 6,
    reserve: 30,
    damage: 22,
    headMult: 1.6,
    interval: 0.62,
    spreadHip: 0.055,
    spreadAds: 0.032,
    reload: 2.4,
    reloadEmpty: 2.8,
    penetration: 1,
    recoil: { pitch: 0.08, yaw: 0.02, trauma: 0.38, fov: 4, back: 0.09, rot: 0.55 },
    adsFov: 62,
    range: 48,
    pellets: 8,
  },
};

interface Spring { v: number; vel: number }
const spring = (s: Spring, target: number, k: number, d: number, dt: number) => {
  const a = (target - s.v) * k - s.vel * d;
  s.vel += a * dt;
  s.v += s.vel * dt;
};

type State = "idle" | "reload" | "lower" | "raise";

interface Gun {
  def: WeaponDef;
  ammo: number;
  reserve: number;
  root: THREE.Group;
  shotsFired: number;
}

export interface FireEvent {
  def: WeaponDef;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  extraDirs: THREE.Vector3[];
  muzzleWorld: THREE.Vector3;
}

export class WeaponSystem {
  readonly holder = new THREE.Group();
  readonly guns: Gun[];
  current = 0;
  state: State = "raise";
  private stateT = 0;
  private stateDur = 0.35;
  private nextFireAt = 0;
  private reloadWasEmpty = false;
  private pendingSwap = -1;
  private m1911?: M1911Model;
  private anaconda?: AnacondaModel;
  private ruger?: AnacondaModel;
  private winchester?: WinchesterModel;
  private flash: THREE.Mesh;
  private flashLife = 0;
  private kickZ: Spring = { v: 0, vel: 0 };
  private kickRot: Spring = { v: 0, vel: 0 };
  private swayX = 0;
  private swayY = 0;
  private adsT = 0;
  private sprintT = 0;
  private slideBack = 0;
  private slideLocked = false;
  private cylAngle = 0;
  private cylTarget = 0;
  private hammerBack = 0;
  private time = 0;
  private ejected = false;
  private chamberedAfterReload = false;
  onFire?: (e: FireEvent) => void;
  onEjectShell?: (worldPos: THREE.Vector3) => void;
  onDumpShells?: (worldPos: THREE.Vector3, count: number) => void;
  onDryFire?: () => void;
  canFire = true;
  shotsFired = 0;
  reloadsDone = 0;
  swapsDone = 0;

  constructor(
    private readonly viewScene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    private readonly viewCamera: THREE.PerspectiveCamera,
    private readonly worldCamera: THREE.PerspectiveCamera,
    private readonly audio: AudioEngine,
    loadout: LoadoutId = 0,
  ) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    viewScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    viewScene.environmentIntensity = 0.9;

    const ids = LOADOUTS[loadout]?.guns ?? LOADOUTS[0].guns;
    const roots = new Map<GunKind, THREE.Group>();
    for (const id of ids) {
      const hands = buildHands();
      if (id === "m1911") {
        this.m1911 = buildM1911();
        this.m1911.root.add(hands.right, hands.left);
        roots.set(id, this.m1911.root);
      } else if (id === "anaconda") {
        this.anaconda = buildAnaconda();
        this.anaconda.root.add(hands.right, hands.left);
        hands.right.position.set(0, 0, 0.008);
        hands.left.position.set(0, -0.002, 0.008);
        roots.set(id, this.anaconda.root);
      } else if (id === "ruger") {
        this.ruger = buildRugerRedhawk();
        this.ruger.root.add(hands.right, hands.left);
        hands.right.position.set(0, 0, 0.008);
        hands.left.position.set(0, -0.002, 0.008);
        roots.set(id, this.ruger.root);
      } else {
        this.winchester = buildWinchester12();
        this.winchester.root.add(hands.right, hands.left);
        hands.left.position.set(-0.01, -0.01, -0.04);
        roots.set(id, this.winchester.root);
      }
    }

    this.guns = ids.map((id) => ({
      def: WEAPONS[id],
      ammo: WEAPONS[id].mag,
      reserve: WEAPONS[id].reserve,
      root: roots.get(id)!,
      shotsFired: 0,
    }));
    for (const g of this.guns) {
      g.root.visible = false;
      this.holder.add(g.root);
    }
    this.guns[0].root.visible = true;

    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,240,1)");
    grad.addColorStop(0.2, "rgba(255,210,120,0.95)");
    grad.addColorStop(0.5, "rgba(255,120,20,0.4)");
    grad.addColorStop(1, "rgba(255,60,0,0)");
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 22 : 64;
      g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.flash.visible = false;
    this.holder.add(this.flash);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 1);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4);
    rim.position.set(-2, 1, -1);
    viewScene.add(new THREE.AmbientLight(0xffffff, 0.35), key, rim);
    this.keyLight = key;
    viewCamera.add(this.holder);
    viewScene.add(viewCamera);
  }

  readonly keyLight: THREE.DirectionalLight;

  get gun() { return this.guns[this.current]; }
  get def() { return this.gun.def; }
  get reloading() { return this.state === "reload"; }
  get reloadProgress() { return this.state === "reload" ? this.stateT / this.stateDur : 0; }
  get adsAmount() { return this.adsT; }
  get spread() {
    return THREE.MathUtils.lerp(this.def.spreadHip, this.def.spreadAds, this.adsT);
  }

  setLighting(sun: THREE.Color, intensity: number) {
    this.keyLight.color.copy(sun);
    this.keyLight.intensity = 1.2 + intensity * 0.5;
    this.viewScene.environmentIntensity = 0.22 + intensity * 0.11;
  }

  addReserve(id: GunKind, n: number) {
    const g = this.guns.find((x) => x.def.id === id);
    if (!g) return;
    g.reserve = Math.min(g.reserve + n, 90);
  }

  addSecondaryReserve(n: number) {
    const g = this.guns[1] ?? this.guns[0];
    g.reserve = Math.min(g.reserve + n, 90);
  }

  refill() {
    for (const g of this.guns) {
      g.ammo = g.def.mag;
      g.reserve = g.def.reserve;
    }
  }

  switchTo(i: number) {
    if (i === this.current || i < 0 || i >= this.guns.length) return;
    if (this.state === "lower" || this.state === "raise") {
      this.pendingSwap = i;
      return;
    }
    this.pendingSwap = i;
    this.setState("lower", 0.18);
    this.audio.weaponSwap();
  }

  private setState(s: State, dur: number) {
    this.state = s;
    this.stateT = 0;
    this.stateDur = dur;
  }

  startReload() {
    const g = this.gun;
    if (this.state !== "idle" || g.ammo >= g.def.mag || g.reserve <= 0) return;
    this.reloadWasEmpty = g.ammo === 0;
    this.ejected = false;
    this.chamberedAfterReload = false;
    this.setState("reload", this.reloadWasEmpty ? g.def.reloadEmpty : g.def.reload);
    this.audio.reload(g.def.id, this.reloadWasEmpty);
  }

  private finishReload() {
    const g = this.gun;
    const want = g.def.mag - g.ammo + (g.def.id === "m1911" && !this.reloadWasEmpty ? 1 : 0);
    const take = Math.min(want, g.reserve);
    g.ammo += take;
    if (Number.isFinite(g.reserve)) g.reserve -= take;
    this.slideLocked = false;
    this.reloadsDone++;
  }

  update(dt: number, input: Input, player: Player, now: number) {
    this.time += dt;
    if (input.wasPressed("Digit1")) this.switchTo(0);
    if (input.wasPressed("Digit2")) this.switchTo(1);
    if (input.wasPressed("KeyQ") || input.wheel !== 0) this.switchTo(this.current === 0 ? 1 : 0);
    if (input.wasPressed("KeyR")) this.startReload();

    const wantAds = input.adsHeld && this.state === "idle" && player.alive;
    player.ads = wantAds;
    this.adsT += ((wantAds ? 1 : 0) - this.adsT) * (1 - Math.exp(-dt * 14));
    this.sprintT += ((player.sprinting && this.state === "idle" ? 1 : 0) - this.sprintT) * (1 - Math.exp(-dt * 8));

    this.stateT += dt;
    if (this.state === "lower" && this.stateT >= this.stateDur) {
      this.gun.root.visible = false;
      this.current = this.pendingSwap >= 0 ? this.pendingSwap : this.current;
      this.pendingSwap = -1;
      this.gun.root.visible = true;
      this.swapsDone++;
      this.setState("raise", 0.28);
    } else if (this.state === "raise" && this.stateT >= this.stateDur) {
      this.setState("idle", 0);
      if (this.pendingSwap >= 0 && this.pendingSwap !== this.current) {
        const p = this.pendingSwap;
        this.pendingSwap = -1;
        this.switchTo(p);
      }
    } else if (this.state === "reload" && this.stateT >= this.stateDur) {
      this.finishReload();
      this.setState("idle", 0);
    }

    if (input.firePressed && player.alive && this.canFire) this.tryFire(now);
    if (this.state === "idle" && this.gun.ammo === 0 && this.gun.reserve > 0 && now > this.nextFireAt + 0.25) this.startReload();

    this.animate(dt, input, player);
  }

  private tryFire(now: number) {
    if (this.state !== "idle" || now < this.nextFireAt) return;
    const g = this.gun;
    if (g.ammo <= 0) {
      this.audio.dryFire();
      this.onDryFire?.();
      this.nextFireAt = now + 0.2;
      if (g.reserve > 0) this.startReload();
      return;
    }
    g.ammo--;
    g.shotsFired++;
    this.shotsFired++;
    this.nextFireAt = now + g.def.interval;
    const r = g.def.recoil;
    this.kickZ.vel += r.back * 60;
    this.kickRot.vel += r.rot * 40;
    this.flashLife = this.isRevolver(g.def.id) || g.def.id === "winchester" ? 0.06 : 0.04;
    this.hammerBack = 1;

    if (g.def.id === "m1911" && this.m1911) {
      this.slideBack = 1;
      if (g.ammo === 0) this.slideLocked = true;
      const ej = new THREE.Vector3();
      this.m1911.ejection.getWorldPosition(ej);
      this.onEjectShell?.(this.toWorld(ej));
    } else if (this.isRevolver(g.def.id)) {
      this.cylTarget += Math.PI / 3;
    } else if (this.winchester) {
      this.slideBack = 1;
      const ej = new THREE.Vector3();
      this.winchester.ejection.getWorldPosition(ej);
      this.onEjectShell?.(this.toWorld(ej));
    }

    this.audio.gunshot(g.def.id);

    const cam = this.worldCamera;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const aim = (spread: number) => {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * spread;
      return dir.addScaledVector(right, Math.cos(a) * m).addScaledVector(up, Math.sin(a) * m).normalize();
    };
    const dir = aim(this.spread);
    const extraDirs: THREE.Vector3[] = [];
    const pellets = g.def.pellets ?? 1;
    for (let i = 1; i < pellets; i++) extraDirs.push(aim(this.spread * 1.15));
    const mz = new THREE.Vector3();
    this.muzzleOf(g.def.id).getWorldPosition(mz);
    this.onFire?.({ def: g.def, origin: cam.position.clone(), dir, extraDirs, muzzleWorld: this.toWorld(mz) });
  }

  private isRevolver(id: GunKind) {
    return id === "anaconda" || id === "ruger";
  }

  private revolverOf(id: GunKind) {
    return id === "ruger" ? this.ruger : this.anaconda;
  }

  private muzzleOf(id: GunKind) {
    if (id === "m1911") return this.m1911!.muzzle;
    if (id === "winchester") return this.winchester!.muzzle;
    return this.revolverOf(id)!.muzzle;
  }

  /** Viewmodel-space point -> approximate world-space point near the real camera. */
  private toWorld(viewPos: THREE.Vector3) {
    const local = this.viewCamera.worldToLocal(viewPos.clone());
    return this.worldCamera.localToWorld(local);
  }

  private animate(dt: number, input: Input, player: Player) {
    const g = this.gun;
    const isRevolver = this.isRevolver(g.def.id);
    const shotgun = g.def.id === "winchester";
    const revolver = isRevolver ? this.revolverOf(g.def.id)! : null;
    const model = shotgun ? this.winchester! : isRevolver ? revolver! : this.m1911!;

    spring(this.kickZ, 0, 260, 18, dt);
    spring(this.kickRot, 0, 220, 16, dt);
    this.swayX += (-input.mouseDX * 0.00025 - this.swayX) * (1 - Math.exp(-dt * 10));
    this.swayY += (input.mouseDY * 0.00025 - this.swayY) * (1 - Math.exp(-dt * 10));

    const hip = new THREE.Vector3(shotgun ? 0.16 : 0.13, shotgun ? -0.16 : -0.135, shotgun ? -0.42 : -0.34);
    const ads = new THREE.Vector3(0, -model.sightHeight, shotgun ? -0.38 : isRevolver ? -0.3 : -0.27);
    const pos = hip.clone().lerp(ads, this.adsT);
    const rot = new THREE.Euler(0, 0, 0);
    const adsDamp = 1 - this.adsT * 0.85;

    const { phase, amount } = player.bob;
    pos.x += Math.cos(phase) * 0.012 * amount * adsDamp;
    pos.y += -Math.abs(Math.sin(phase)) * 0.014 * amount * adsDamp + Math.sin(this.time * 1.6) * 0.0015 * adsDamp;
    pos.x += this.swayX * adsDamp;
    pos.y += this.swayY * adsDamp;
    rot.z += this.swayX * 2 * adsDamp;

    pos.x -= this.sprintT * 0.06;
    pos.y -= this.sprintT * 0.05;
    rot.y += this.sprintT * 0.75;
    rot.x -= this.sprintT * 0.35;

    pos.z += this.kickZ.v * 0.016;
    pos.y += this.kickZ.v * 0.004;
    rot.x += this.kickRot.v * 0.02;

    const t = this.stateDur > 0 ? Math.min(1, this.stateT / this.stateDur) : 1;
    if (this.state === "lower") {
      pos.y -= easeIn(t) * 0.3;
      rot.x -= t * 0.6;
    } else if (this.state === "raise") {
      pos.y -= (1 - easeOut(t)) * 0.3;
      rot.x -= (1 - easeOut(t)) * 0.6;
    } else if (this.state === "reload") {
      if (isRevolver) this.animateRevolverReload(t, pos, rot);
      else if (shotgun) this.animateShotgunReload(t, pos, rot);
      else this.animatePistolReload(t, pos, rot);
    }

    g.root.position.copy(pos);
    g.root.rotation.copy(rot);

    if (g.def.id === "m1911" && this.m1911) {
      this.slideBack = Math.max(0, this.slideBack - dt * 22);
      const back = this.slideLocked && this.state !== "reload" ? 1 : Math.sin(Math.min(1, this.slideBack) * Math.PI * 0.5);
      if (this.state !== "reload" || t < 0.78 || !this.reloadWasEmpty) this.m1911.slide.position.z = back * 0.032;
      this.m1911.hammer.rotation.x = -Math.max(this.hammerBack, back) * 0.5;
    } else if (isRevolver && revolver) {
      this.cylAngle += (this.cylTarget - this.cylAngle) * (1 - Math.exp(-dt * 30));
      revolver.cylinder.rotation.z = this.cylAngle;
      revolver.hammer.rotation.x = this.hammerBack * 0.15;
    } else if (this.winchester) {
      this.slideBack = Math.max(0, this.slideBack - dt * 8);
      const pump = this.state === "idle" ? Math.sin(Math.min(1, this.slideBack) * Math.PI) : 0;
      this.winchester.pump.position.z = -0.16 + pump * 0.05;
      this.winchester.hammer.rotation.x = this.hammerBack * 0.2;
    }
    this.hammerBack = Math.max(0, this.hammerBack - dt * 8);

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      const mz = new THREE.Vector3();
      model.muzzle.getWorldPosition(mz);
      this.holder.worldToLocal(mz);
      this.flash.position.copy(mz);
      this.flash.rotation.z = Math.random() * Math.PI;
      const s = (isRevolver || shotgun ? 2.2 : 1.3) * (0.8 + Math.random() * 0.4);
      this.flash.scale.setScalar(s);
      this.flash.visible = true;
    } else {
      this.flash.visible = false;
    }
  }

  private animatePistolReload(t: number, pos: THREE.Vector3, rot: THREE.Euler) {
    const m = this.m1911;
    if (!m) return;
    const tilt = bell(t, 0.05, 0.9);
    rot.z -= tilt * 0.55;
    rot.x += tilt * 0.25;
    pos.x -= tilt * 0.04;
    pos.y -= tilt * 0.02;
    if (t < 0.15) m.mag.position.y = 0;
    else if (t < 0.32) m.mag.position.y = -easeIn((t - 0.15) / 0.17) * 0.3;
    else if (t < 0.62) m.mag.position.y = -0.3 + easeOut((t - 0.32) / 0.3) * 0.3;
    else m.mag.position.y = t < 0.66 ? 0.006 : 0;
    if (t > 0.62 && t < 0.7) pos.y += 0.01 * Math.sin(((t - 0.62) / 0.08) * Math.PI);
    if (this.reloadWasEmpty) {
      if (t < 0.8) m.slide.position.z = 0.032;
      else m.slide.position.z = 0.032 * (1 - easeOut(Math.min(1, (t - 0.8) / 0.05)));
      if (t > 0.8 && !this.chamberedAfterReload) {
        this.chamberedAfterReload = true;
        this.kickRot.vel += 4;
      }
    }
  }

  private animateShotgunReload(t: number, pos: THREE.Vector3, rot: THREE.Euler) {
    const tilt = bell(t, 0.06, 0.88);
    rot.x += tilt * 0.35;
    pos.y -= tilt * 0.04;
    pos.z += tilt * 0.03;
    if (this.winchester) this.winchester.pump.position.z = -0.16 + bell(t, 0.2, 0.75) * 0.06;
    if (t > 0.35 && t < 0.42 && !this.ejected) {
      this.ejected = true;
      this.kickRot.vel += 3;
    }
  }

  private animateRevolverReload(t: number, pos: THREE.Vector3, rot: THREE.Euler) {
    const a = this.revolverOf(this.gun.def.id)!;
    const tilt = bell(t, 0.04, 0.9);
    rot.z += tilt * 0.7;
    pos.x -= tilt * 0.08;
    pos.y += tilt * 0.01;
    const muzzleUp = t > 0.18 && t < 0.42 ? bell((t - 0.18) / 0.24, 0.2, 0.8) : 0;
    rot.x += muzzleUp * 0.9 + tilt * 0.15;
    const out = t < 0.12 ? easeOut(t / 0.12) : t < 0.74 ? 1 : t < 0.8 ? 1 - easeIn((t - 0.74) / 0.06) : 0;
    a.cylinderPivot.rotation.z = out * 1.25;
    if (t > 0.26 && !this.ejected) {
      this.ejected = true;
      const wp = new THREE.Vector3();
      a.cylinder.getWorldPosition(wp);
      this.onDumpShells?.(this.toWorld(wp), 6);
      this.gun.reserve += this.gun.ammo;
      this.gun.ammo = 0;
    }
    const sl = a.speedloader;
    if (t > 0.42 && t < 0.68) {
      sl.visible = true;
      const k = easeOut((t - 0.42) / 0.2);
      const target = new THREE.Vector3();
      a.cylinder.getWorldPosition(target);
      a.root.worldToLocal(target);
      target.z += 0.035;
      sl.position.set(target.x - 0.06 * (1 - k), target.y - 0.12 * (1 - k), target.z + 0.08 * (1 - k));
      sl.rotation.set(0, 0, (t > 0.62 ? (t - 0.62) * 20 : 0));
    } else {
      sl.visible = false;
    }
    if (t > 0.78 && t < 0.83) pos.x += Math.sin(((t - 0.78) / 0.05) * Math.PI) * 0.01;
  }
}

const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const bell = (t: number, a: number, b: number) =>
  t < a ? easeOut(t / a) : t > b ? 1 - easeIn((t - b) / (1 - b)) : 1;
