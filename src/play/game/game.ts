import * as THREE from "three";
import type { Vec2, WorldData } from "../../../shared/types.ts";
import type { AudioEngine } from "../audio/audio.ts";
import type { Input } from "../engine/input.ts";
import { Renderer } from "../engine/renderer.ts";
import type { HostileKind } from "../enemies/goblinModel.ts";
import { GoblinManager, type Goblin } from "../enemies/goblins.ts";
import { Effects } from "../fx/effects.ts";
import { Player } from "../player/player.ts";
import { Hud } from "../ui/hud.ts";
import type { GameMode } from "../ui/menu.ts";
import { WeaponSystem, type FireEvent, type LoadoutId } from "../weapons/weapons.ts";
import { buildCity, type Car, type CityBuild } from "../world/city.ts";
import { CollisionWorld } from "../world/collision.ts";
import { SkySystem } from "../world/sky.ts";
import { Terrain } from "../world/terrain.ts";
import { Pickups } from "./pickups.ts";

export type Phase = "intro" | "intermission" | "wave" | "victory" | "dead";

export interface RunStats {
  score: number;
  kills: number;
  headshots: number;
  shots: number;
  hits: number;
  wave: number;
  durationSec: number;
  shotsByWeapon: Record<string, number>;
  carsDestroyed: number;
  bestMulti: number;
  mode: GameMode;
}

const MULTI = ["", "", "DOUBLE KILL", "TRIPLE KILL", "QUAD KILL", "GOBLINOCIDE"];

export class Game {
  readonly scene = new THREE.Scene();
  readonly viewScene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 520);
  readonly viewCamera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
  readonly terrain: Terrain;
  readonly collision: CollisionWorld;
  readonly city: CityBuild;
  readonly sky: SkySystem;
  readonly fx: Effects;
  readonly goblins: GoblinManager;
  readonly player: Player;
  readonly weapons: WeaponSystem;
  readonly renderer: Renderer;
  readonly hud: Hud;
  readonly pickups: Pickups;

  phase: Phase = "intro";
  private phaseT = 0;
  wave = 0;
  private spawnQueue: HostileKind[] = [];
  private spawnT = 0;
  private survivalResupplyAt = 45;
  private bossSpawned = false;
  private boss: Goblin | null = null;
  private raycaster = new THREE.Raycaster();
  private rayTargets: THREE.Object3D[];
  private clock = new THREE.Clock();
  private elapsed = 0;
  private now = 0;
  private timeScale = 1;
  private slowmoT = 0;
  private combo = 1;
  private comboT = 0;
  private multiCount = 0;
  private multiT = 0;
  private streak = 0;
  private flashV = 0;
  private chromaV = 0;
  private heartbeatT = 0;
  private hudT = 0;
  private running = true;
  private raf = 0;
  private startedAt = 0;
  photoMode = false;
  readonly mode: GameMode;
  readonly stats: RunStats;
  onEnd?: (victory: boolean, stats: RunStats) => void;
  onPauseRequest?: () => void;

  constructor(
    readonly world: WorldData,
    gl: THREE.WebGLRenderer,
    readonly input: Input,
    readonly audio: AudioEngine,
    uiRoot: HTMLElement,
    loadout: LoadoutId = 0,
    mode: GameMode = "waves",
  ) {
    this.mode = mode;
    this.stats = {
      score: 0, kills: 0, headshots: 0, shots: 0, hits: 0, wave: 0, durationSec: 0,
      shotsByWeapon: {}, carsDestroyed: 0, bestMulti: 0, mode,
    };
    this.terrain = new Terrain(world);
    this.scene.add(this.terrain.mesh, this.terrain.skirt);
    const built = buildCity(world, this.terrain, (c) => new CollisionWorld(this.terrain, c));
    this.city = built.build;
    this.collision = built.collisionWorld;
    this.scene.add(this.city.group);
    this.sky = new SkySystem(this.scene, world.director, world.weather);
    if (this.scene.fog instanceof THREE.FogExp2) {
      const dense = Math.min(1, world.stats.buildings / 900);
      this.scene.fog.density = world.director.fogDensity * (1 + this.sky.night * 0.5) * (1 + dense * 1.35);
    }
    this.camera.far = world.stats.buildings > 400 ? 380 : 520;
    this.camera.updateProjectionMatrix();
    this.city.windowMaterial.emissiveIntensity = this.sky.night * 0.95;
    gl.toneMappingExposure = 1 + this.sky.night * 0.45;

    this.fx = new Effects((x, z) => this.collision.groundAt(x, z));
    this.fx.onShellLand = () => this.audio.shellTink();
    this.scene.add(this.fx.group);

    this.goblins = new GoblinManager(this.collision, this.fx, audio);
    this.scene.add(this.goblins.group);
    this.pickups = new Pickups(this.fx, (x, z) => this.collision.groundAt(x, z));
    this.scene.add(this.pickups.group);

    this.player = new Player(this.collision, audio);
    const [hx, hz] = world.director.heroSpawn;
    this.player.spawn(hx, hz);
    this.player.yaw = Math.atan2(hx, hz);

    this.renderer = new Renderer(gl, this.scene, this.camera, this.viewScene, this.viewCamera);
    if (world.stats.buildings > 500) this.renderer.bloom.enabled = false;
    this.weapons = new WeaponSystem(this.viewScene, gl, this.viewCamera, this.camera, audio, loadout);
    this.weapons.setLighting(this.sky.sun.color, this.sky.sun.intensity);
    this.weapons.onFire = (e) => this.handleFire(e);
    this.weapons.onEjectShell = (p) => {
      const q = this.camera.quaternion;
      this.fx.ejectShell(p, new THREE.Vector3(1, 0, 0).applyQuaternion(q), new THREE.Vector3(0, 1, 0).applyQuaternion(q));
    };
    this.weapons.onDumpShells = (p, n) => {
      const q = this.camera.quaternion;
      for (let i = 0; i < n; i++) {
        setTimeout(() => this.fx.ejectShell(p, new THREE.Vector3(-0.3 + Math.random() * 0.6, 0, 0).applyQuaternion(q), new THREE.Vector3(0, -0.4, 0)), i * 25);
      }
    };
    this.rayTargets = [this.terrain.mesh, ...this.city.buildingMeshes];

    this.hud = new Hud(uiRoot, world);
    this.hud.setWave(0, world.director.waves);
    audio.setEnvironment(Math.min(1, world.stats.buildings / 800));

    this.goblins.onPlayerHit = (dmg, from) => this.hurtPlayer(dmg, from);
    this.goblins.onKilled = (g, by) => {
      if (by === "rival") this.onGoblinKilled(g, false, "m1911", 10, 1, false, true);
    };
    this.goblins.onTaunt = (g) => {
      const t = world.director.taunts;
      if (t.length) this.hud.killfeed(`<em>${g.def.name.toUpperCase()}</em>“${t[Math.floor(Math.random() * t.length)]}”`, false);
    };
    this.goblins.onSummon = (x, z) => {
      for (let i = 0; i < 2; i++) this.spawnNear("runner", x, z, 6);
      this.spawnNear("geezer", x, z, 6);
    };

    this.raf = requestAnimationFrame(this.loop);
  }

  start() {
    this.startedAt = this.elapsed;
    this.audio.startMusic();
    this.beginIntermission();
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const rawDt = Math.min(0.05, this.clock.getDelta());
    if (this.slowmoT > 0) {
      this.slowmoT -= rawDt;
      this.timeScale += (0.25 - this.timeScale) * 0.3;
    } else {
      this.timeScale += (1 - this.timeScale) * 0.12;
    }
    const paused = !this.input.locked && !this.photoMode && this.phase !== "victory" && this.phase !== "dead" && this.phase !== "intro";
    const dt = paused ? 0 : rawDt * this.timeScale;
    this.elapsed += rawDt;
    this.now += dt;
    this.update(dt, rawDt);
    this.input.endFrame();
  };

  private update(dt: number, rawDt: number) {
    if (dt > 0) {
      this.phaseT += dt;
      this.player.update(dt, this.input, this.now);
      this.weapons.update(dt, this.input, this.player, this.now);
      this.goblins.update(dt, this.player, this.now);
      this.city.cars.update(dt);
      this.updatePhase(dt);
      this.updateCombo(dt);
      this.pickups.update(dt, this.elapsed, this.player.pos, (k) => this.collect(k));
      const wu = this.city.waterMaterial.userData.uniforms as { uTime: { value: number } };
      wu.uTime.value = this.elapsed;
    }
    this.fx.update(dt);
    this.player.applyCamera(this.camera, 78, this.weapons.def.adsFov);
    this.sky.update(dt, this.elapsed, this.player.pos);

    this.flashV *= Math.exp(-rawDt * 18);
    this.chromaV *= Math.exp(-rawDt * 6);
    const hpLow = 1 - this.player.health / this.player.maxHealth;
    const u = this.renderer.u;
    u.uFlash.value = this.flashV;
    u.uChroma.value = 0.0012 + this.chromaV * 0.012;
    u.uDamage.value = Math.max(hpLow > 0.6 ? (hpLow - 0.6) * 1.5 : 0, Math.max(0, 0.6 - (this.now - this.player.lastDamageAt)) * 0.9);
    u.uDesat.value = (1 - this.timeScale) * 0.8 + (this.player.alive ? 0 : 0.85);

    if (this.player.alive && hpLow > 0.7 && dt > 0) {
      this.heartbeatT -= rawDt;
      if (this.heartbeatT <= 0) {
        this.heartbeatT = 0.85;
        this.audio.heartbeat();
      }
    }

    this.hudT -= rawDt;
    if (this.hudT <= 0) {
      this.hudT = 1 / 30;
      this.updateHud();
    }
    const alive = this.goblins.alive.length;
    this.audio.musicIntensity = this.phase === "wave" ? Math.min(1, 0.35 + alive / 12) : 0.2;
    this.renderer.render(this.elapsed);
  }

  private updateHud() {
    const w = this.weapons;
    const g = w.gun;
    this.hud.setAmmo(g.def.name, g.def.sub, g.ammo, g.def.mag, g.reserve, g.def.id === "anaconda" || g.def.id === "ruger", w.reloadProgress);
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setScore(this.stats.score, this.combo);
    this.hud.setEnemies(this.goblins.alive.length + this.spawnQueue.length);
    const moving = this.player.speed01;
    this.hud.setSpread(4 + w.spread * 500 + moving * 10 + (this.player.onGround ? 0 : 10), w.adsAmount > 0.6);
    this.hud.drawMinimap(
      this.player.pos.x, this.player.pos.z, this.player.yaw,
      this.goblins.goblins.filter((x) => x.state !== "dead").map((x) => ({ x: x.pos.x, z: x.pos.z, boss: x.kind === "king", geezer: x.kind === "geezer" })),
      this.pickups.items.map((p) => ({ x: p.pos.x, z: p.pos.z })),
    );
    if (this.boss && this.boss.state !== "dead") this.hud.bossBar(this.boss.def.name, this.boss.hp / this.boss.def.hp);
    else this.hud.bossBar(null);
  }

  private handleFire(e: FireEvent) {
    const big = e.def.id === "anaconda" || e.def.id === "winchester";
    this.stats.shots++;
    this.stats.shotsByWeapon[e.def.id]++;
    this.fx.muzzle(e.muzzleWorld, e.dir, big);
    const r = e.def.recoil;
    const adsK = 1 - this.weapons.adsAmount * 0.35;
    this.player.kick(r.pitch * adsK, (Math.random() - 0.5) * r.yaw * 2, r.trauma, r.fov);
    this.flashV = big ? 0.12 : 0.05;
    this.chromaV = big ? 1 : 0.25;

    let anyHit = false;
    let killsThisShot = 0;
    const dirs = [e.dir, ...e.extraDirs];
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      this.raycaster.set(e.origin, dir);
      this.raycaster.far = e.def.range;
      const worldHit = this.raycaster.intersectObjects(this.rayTargets, false)[0];
      let stopDist = worldHit ? worldHit.distance : e.def.range;
      const carHit = this.city.cars.raycast(e.origin, dir, stopDist);
      if (carHit) stopDist = carHit.dist;

      const hits = this.goblins.raycast(e.origin, dir, stopDist);
      let damage = e.def.damage;
      let pierced = 0;
      let endPoint = e.origin.clone().addScaledVector(dir, stopDist);
      const seen = new Set<Goblin>();
      for (const h of hits) {
        if (seen.has(h.goblin)) continue;
        seen.add(h.goblin);
        if (pierced >= e.def.penetration) break;
        anyHit = true;
        const falloff = h.dist > 60 ? Math.max(0.6, 1 - (h.dist - 60) / 200) : 1;
        const dmg = damage * falloff * (h.head ? e.def.headMult : 1);
        const killed = this.goblins.damage(h.goblin, dmg, dir, h.head, big);
        if (h.goblin.faction === "geezer") this.fx.blood(h.point, dir.clone().negate().lerp(dir, 0.7), killed ? 1.3 : 0.7, h.goblin.pos.y);
        else this.fx.goo(h.point, dir.clone().negate().lerp(dir, 0.7), killed ? 1.3 : 0.7, h.goblin.pos.y);
        this.audio.impact("flesh", 0);
        this.audio.hitmarker(h.head);
        this.hud.hitmarker(killed ? "kill" : h.head ? "head" : "hit");
        if (killed) {
          killsThisShot++;
          this.onGoblinKilled(h.goblin, h.head, e.def.id, h.dist, killsThisShot);
        }
        endPoint = h.point;
        pierced++;
        damage *= 0.7;
      }
      if (pierced < e.def.penetration || hits.length === 0) {
        endPoint = e.origin.clone().addScaledVector(dir, stopDist);
        if (carHit && carHit.dist <= stopDist + 0.01) {
          this.fx.impact(endPoint, dir.clone().negate(), "hard", big);
          this.audio.impact("hard");
          anyHit = true;
          if (this.city.cars.damage(carHit.car, e.def.damage)) this.explodeCar(carHit.car);
        } else if (worldHit) {
          const n = worldHit.face ? worldHit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
          const surface = worldHit.object === this.terrain.mesh ? "dirt" : "hard";
          this.fx.impact(worldHit.point, n, surface, big);
          this.audio.impact(surface === "dirt" ? "dirt" : "hard");
        }
      }
      if (i === 0 || anyHit) this.fx.tracer(e.muzzleWorld, endPoint, big && i === 0);
    }
    if (anyHit) this.stats.hits++;
  }

  private explodeCar(car: Car) {
    this.stats.carsDestroyed++;
    const pos = new THREE.Vector3(car.x, car.y + 1, car.z);
    this.explosion(pos, 9, 260);
    for (const other of this.city.cars.cars) {
      if (other === car || other.dead) continue;
      if (Math.hypot(other.x - car.x, other.z - car.z) < 7) {
        setTimeout(() => {
          if (this.city.cars.damage(other, 400)) this.explodeCar(other);
        }, 180 + Math.random() * 200);
      }
    }
  }

  private explosion(pos: THREE.Vector3, radius: number, damage: number) {
    this.fx.explosion(pos, 1);
    const dist = pos.distanceTo(this.player.pos);
    this.audio.explosion(dist);
    this.player.shake(Math.max(0, 0.9 - dist / 60));
    this.flashV = Math.max(this.flashV, Math.max(0, 0.5 - dist / 120));
    let kills = 0;
    for (const g of [...this.goblins.goblins]) {
      if (g.state === "dead") continue;
      const d = g.pos.distanceTo(pos);
      if (d < radius) {
        const dir = g.pos.clone().sub(pos).setY(0.4).normalize();
        if (this.goblins.damage(g, damage * (1 - d / radius) + 40, dir, false, true)) {
          kills++;
          this.onGoblinKilled(g, false, "anaconda", d, kills, true);
        }
      }
    }
    if (dist < radius * 0.7) this.hurtPlayer(35 * (1 - dist / (radius * 0.7)), pos);
  }

  private onGoblinKilled(g: Goblin, head: boolean, weapon: FireEvent["def"]["id"], dist: number, killsThisShot: number, explosive = false, rival = false) {
    if (g.dummy) {
      this.hud.killfeed(`${head ? "HEADSHOT" : "DUMMY"} <em>${weaponTagFor(weapon)}</em>`, head);
      return;
    }
    this.stats.kills++;
    if (head) this.stats.headshots++;
    if (!rival) {
      this.streak++;
      this.multiCount = this.multiT > 0 ? this.multiCount + 1 : 1;
      this.multiT = 1.8;
      this.combo = Math.min(8, this.comboT > 0 ? this.combo + 1 : 1);
      this.comboT = 4;
    }

    let pts = g.def.score;
    const tags: string[] = [];
    if (rival) { pts = Math.round(pts * 0.45); tags.push("CIVIL WAR"); }
    if (head) { pts *= 1.5; tags.push("HEADSHOT"); }
    if (killsThisShot > 1 && !explosive) { pts += 250 * (killsThisShot - 1); tags.push("COLLATERAL"); }
    if (dist > 45) { pts += 150; tags.push("LONGSHOT"); }
    if (explosive) { pts += 100; tags.push("KABOOM"); }
    pts = Math.round(pts * (rival ? 1 : this.combo));
    this.stats.score += pts;

    const weaponTag = rival ? "SPEAR DUEL" : explosive ? "CAR BOMB" : weaponTagFor(weapon);
    this.hud.killfeed(`${g.def.name} <em>${weaponTag}${head ? " ✛" : ""}</em>+${pts}`, head);

    if (rival) {
      if (Math.random() < 0.22) this.pickups.drop("health", g.pos.x, g.pos.z);
      return;
    }

    this.stats.bestMulti = Math.max(this.stats.bestMulti, this.multiCount);
    if (this.multiCount >= 2) {
      const label = MULTI[Math.min(5, this.multiCount)];
      this.hud.announce(label, `+${pts} · x${this.combo} COMBO`, this.multiCount >= 4 ? "gold" : "");
      this.audio.sting(this.multiCount);
      this.audio.say(label.toLowerCase(), { pitch: 0.2, rate: 0.85, volume: 0.9 });
      if (this.multiCount >= 3) this.slowmo(0.7);
    } else if (this.streak === 10 || this.streak === 20 || this.streak === 35) {
      const label = this.streak === 10 ? "RAMPAGE" : this.streak === 20 ? "UNSTOPPABLE" : "GOBLIN GENOCIDE";
      this.hud.announce(label, `${this.streak} KILLS WITHOUT A SCRATCH`, "acid");
      this.audio.sting(4);
      this.audio.say(label.toLowerCase(), { pitch: 0.2, rate: 0.85 });
      this.slowmo(0.6);
    } else if (killsThisShot >= 2) {
      this.hud.announce("COLLATERAL", `${killsThisShot} GOBLINS · ONE BULLET`, "gold");
      this.slowmo(0.6);
    } else if (head) {
      this.hud.announce("HEADSHOT", `+${pts}`, "gold");
      if ((weapon === "anaconda" || weapon === "ruger") && (g.kind === "brute" || g.kind === "king")) this.slowmo(0.5);
    }

    if (g.kind === "king") {
      this.hud.announce("KING KRAWK IS DEAD", "LONG LIVE THE ZIP CODE", "gold");
      this.slowmo(1.6);
    }

    const r = Math.random();
    if (g.kind === "brute" || g.kind === "king" || r < 0.3) this.pickups.drop("ammo44", g.pos.x, g.pos.z);
    else if (r < 0.42) this.pickups.drop("health", g.pos.x, g.pos.z);
  }

  private slowmo(sec: number) {
    if (this.slowmoT <= 0) this.audio.whoosh(false, 0.5);
    this.slowmoT = Math.max(this.slowmoT, sec);
  }

  private collect(kind: "ammo44" | "health"): boolean {
    if (kind === "health") {
      if (this.player.health >= this.player.maxHealth) return false;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 35);
      this.hud.killfeed("+35 VITALS", false);
    } else {
      const g = this.weapons.guns[1];
      if (g.reserve >= 90) return false;
      this.weapons.addSecondaryReserve(6);
      const tag = this.weapons.guns[1]?.def.id === "winchester" ? "12 GAUGE" : ".44 MAGNUM";
      this.hud.killfeed(`+6 <em>${tag}</em>`, false);
    }
    this.audio.click(undefined, 1600, 0.3, 0.04);
    this.audio.sting(0);
    return true;
  }

  private updateCombo(dt: number) {
    this.comboT -= dt;
    this.multiT -= dt;
    if (this.comboT <= 0) this.combo = 1;
  }

  private hurtPlayer(dmg: number, from: THREE.Vector3) {
    if (!this.player.alive || this.phase === "victory") return;
    this.player.damage(dmg, this.now);
    this.streak = 0;
    this.audio.hurt();
    const dx = from.x - this.player.pos.x, dz = from.z - this.player.pos.z;
    this.hud.damageFrom(Math.atan2(dx, -dz) + this.player.yaw);
    if (!this.player.alive) this.die();
  }

  private die() {
    this.phase = "dead";
    this.phaseT = 0;
    this.audio.whoosh(false, 1.2);
    this.audio.goblin("laugh", 0.8, 0, 5);
    this.hud.announce("YOU GOT GOBLINED", `${this.world.place.name.toUpperCase()} FALLS`, "");
    this.audio.stopMusic();
    setTimeout(() => this.finish(false), 2600);
  }

  private beginIntermission() {
    if (this.mode === "survival") {
      this.startSurvival();
      return;
    }
    this.phase = "intermission";
    this.phaseT = 0;
    this.player.health = this.player.maxHealth;
    if (this.wave > 0) this.weapons.addSecondaryReserve(12);
  }

  private startSurvival() {
    this.phase = "wave";
    this.phaseT = 0;
    this.wave = 1;
    this.stats.wave = 1;
    this.spawnQueue = [];
    this.spawnT = 0.4;
    this.hud.setMission("0:00", "SURVIVAL");
    this.hud.announce("SURVIVAL", "THE HORDE NEVER STOPS · LAST AS LONG AS YOU CAN", "");
    this.audio.goblin("alert", 0.9, 0, 30);
    for (let i = 0; i < 8; i++) this.spawnFromZones(this.pickSurvivalKind(0));
  }

  private pickSurvivalKind(elapsed: number): HostileKind {
    const r = Math.random();
    if (elapsed > 240 && r < 0.03) return "king";
    if (elapsed > 120 && r < 0.14) return "brute";
    if (elapsed > 60 && r < 0.22) return "shaman";
    if (r < 0.28) return "runner";
    if (r < 0.55) return "geezer";
    return "grunt";
  }

  private updateSurvival(dt: number) {
    const elapsed = Math.max(0, this.elapsed - this.startedAt);
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    this.hud.setMission(`${mins}:${secs.toString().padStart(2, "0")}`, "SURVIVAL");
    this.stats.wave = Math.max(1, mins + 1);
    const cap = Math.min(22, 10 + Math.floor(elapsed / 40));
    this.spawnT -= dt;
    if (this.goblins.alive.length < cap && this.spawnT <= 0) {
      this.spawnT = Math.max(0.28, 1.05 - elapsed / 200);
      this.spawnFromZones(this.pickSurvivalKind(elapsed));
    }
    if (elapsed >= this.survivalResupplyAt) {
      this.survivalResupplyAt += 45;
      this.weapons.addSecondaryReserve(24);
      this.hud.announce("RESUPPLY", "+24 M60 ROUNDS", "acid");
    }
  }

  private updatePhase(dt: number) {
    if (this.mode === "survival" && this.phase === "wave") {
      this.updateSurvival(dt);
      return;
    }
    const dir = this.world.director;
    if (this.phase === "intermission") {
      const remaining = Math.ceil(6 - this.phaseT);
      const next = this.wave + 1;
      const final = next === dir.waves;
      this.hud.interstitial(final ? "FINAL WAVE" : `WAVE ${next}`, final ? "THE GOBLIN KING APPROACHES" : `${dir.codename} · ${this.world.place.name.toUpperCase()}`, remaining > 0 ? String(remaining) : "");
      if (this.phaseT >= 6) {
        this.hud.interstitial(null);
        this.startWave(next);
      }
    } else if (this.phase === "wave") {
      this.spawnT -= dt;
      if (this.spawnQueue.length && this.spawnT <= 0 && this.goblins.alive.length < 16 + this.wave * 2) {
        this.spawnT = 0.45 + Math.random() * 0.8;
        this.spawnFromZones(this.spawnQueue.shift()!);
      }
      if (this.wave === dir.waves && !this.bossSpawned && this.spawnQueue.length < 4) {
        this.bossSpawned = true;
        this.boss = this.spawnFromZones("king");
        this.hud.announce("KRAWK THE GOBLIN KING", "HAS ENTERED THE ZIP CODE", "");
        this.audio.goblin("laugh", 0.35, 0, 20);
        this.player.shake(0.6);
      }
      const cleared = this.spawnQueue.length === 0 && this.goblins.alive.length === 0 && (this.wave < dir.waves || this.bossSpawned);
      if (cleared && this.phaseT > 2) {
        if (this.wave >= dir.waves) this.victory();
        else {
          this.hud.announce(`WAVE ${this.wave} CLEARED`, `+${500 * this.wave} BONUS`, "acid");
          this.stats.score += 500 * this.wave;
          this.audio.sting(3);
          this.beginIntermission();
        }
      }
    }
  }

  private startWave(n: number) {
    this.wave = n;
    this.stats.wave = n;
    this.phase = "wave";
    this.phaseT = 0;
    this.hud.setWave(n, this.world.director.waves);
    const count = this.world.director.goblinsPerWave + (n - 1) * 3;
    const geezerN = Math.max(2, Math.round(count * 0.34));
    this.spawnQueue = [];
    for (let i = 0; i < count - geezerN; i++) {
      const r = Math.random();
      let k: HostileKind = "grunt";
      if (n >= 2 && r < 0.28) k = "runner";
      else if (n >= 3 && r < 0.42) k = "shaman";
      else if (n >= 2 && r < 0.42 + n * 0.03) k = "brute";
      this.spawnQueue.push(k);
    }
    for (let i = 0; i < geezerN; i++) this.spawnQueue.push("geezer");
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    const geezers = geezerN;
    this.spawnT = 0.5;
    this.audio.goblin("alert", 0.9, 0, 30);
    const sub = geezers ? `${count - geezers} GOBLINS · ${geezers} EMO GIRLS` : `${count} GOBLINS INBOUND`;
    this.hud.announce(`WAVE ${n}`, sub, "");
  }

  private spawnFromZones(kind: HostileKind): Goblin {
    const zones = this.world.director.spawnZones;
    const p = this.player.pos;
    const candidates = zones
      .map(([x, z]) => ({ x, z, d: Math.hypot(x - p.x, z - p.z) }))
      .filter((c) => c.d > 25 && c.d < 170 && this.spawnClear(c.x, c.z));
    let base: Vec2;
    if (candidates.length) {
      const c = candidates[Math.floor(Math.random() * candidates.length)];
      base = [c.x, c.z];
    } else {
      const a = Math.random() * Math.PI * 2, r = 35 + Math.random() * 30;
      base = [p.x + Math.cos(a) * r, p.z + Math.sin(a) * r];
    }
    return this.spawnNear(kind, base[0], base[1], 14);
  }

  /** Outside building footprints so goblins never trap inside unreachable interiors. */
  private spawnClear(x: number, z: number) {
    if (this.collision.buildingAt(x, z)) return false;
    const lim = this.terrain.half - 8;
    return Math.abs(x) < lim && Math.abs(z) < lim;
  }

  private spawnNear(kind: HostileKind, x: number, z: number, spread: number): Goblin {
    const lim = this.terrain.half - 6;
    let sx = x, sz = z;
    for (let i = 0; i < 48; i++) {
      const r = spread * (0.35 + Math.random() * 1.4);
      const a = Math.random() * Math.PI * 2;
      sx = THREE.MathUtils.clamp(x + Math.cos(a) * r, -lim, lim);
      sz = THREE.MathUtils.clamp(z + Math.sin(a) * r, -lim, lim);
      if (this.spawnClear(sx, sz)) return this.goblins.spawn(kind, sx, sz);
    }
    for (let ring = 10; ring < 80; ring += 8) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.random();
        sx = THREE.MathUtils.clamp(this.player.pos.x + Math.cos(a) * ring, -lim, lim);
        sz = THREE.MathUtils.clamp(this.player.pos.z + Math.sin(a) * ring, -lim, lim);
        if (this.spawnClear(sx, sz)) return this.goblins.spawn(kind, sx, sz);
      }
    }
    return this.goblins.spawn(kind, this.player.pos.x + 12, this.player.pos.z);
  }

  private victory() {
    this.phase = "victory";
    this.stats.score += 5000;
    this.hud.interstitial("ZIP CODE LIBERATED", `${this.world.place.name.toUpperCase()}, ${this.world.place.stateAbbr} ${this.world.place.zip}`);
    this.audio.sting(5);
    this.audio.say(`${this.world.place.name} liberated`, { pitch: 0.2, rate: 0.85 });
    this.audio.stopMusic();
    setTimeout(() => this.finish(true), 3500);
  }

  private finish(victory: boolean) {
    this.stats.durationSec = this.elapsed - this.startedAt;
    this.input.unlock();
    this.onEnd?.(victory, this.stats);
  }

  get isOver() {
    return this.phase === "victory" || this.phase === "dead";
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.audio.stopMusic();
    this.hud.destroy();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
  }

  /** Dev hooks used to capture marketing screenshots. */
  debugSpawn(kind: HostileKind, dist: number, angle = 0) {
    const yaw = this.player.yaw + angle;
    return this.spawnNear(kind, this.player.pos.x - Math.sin(yaw) * dist, this.player.pos.z - Math.cos(yaw) * dist, 1);
  }

  debugFire() {
    this.input.firePressed = true;
  }
}

function weaponTagFor(weapon: string) {
  if (weapon === "anaconda" || weapon === "ruger") return ".44 MAG";
  if (weapon === "winchester") return "12 GAUGE";
  if (weapon === "precision") return "6.5 CM";
  if (weapon === "m60") return "7.62 NATO";
  return ".45 ACP";
}
