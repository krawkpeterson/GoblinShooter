import * as THREE from "three";
import type { AudioEngine } from "../audio/audio.ts";
import type { Effects } from "../fx/effects.ts";
import type { Player } from "../player/player.ts";
import type { CollisionWorld } from "../world/collision.ts";
import { buildDino } from "./dinoModel.ts";
import { FlowField } from "./flowField.ts";
import { buildGeezer } from "./geezerModel.ts";
import { makeHealthBar, updateHealthBar } from "./healthBar.ts";
import { buildGoblin, type DinoKind, type Faction, type GoblinKind, type GoblinRig, type HostileKind } from "./goblinModel.ts";

export interface GoblinDef {
  hp: number;
  speed: number;
  damage: number;
  scale: number;
  score: number;
  attackRange: number;
  windup: number;
  cooldown: number;
  name: string;
  voice: number;
}

export const GOBLINS: Record<GoblinKind, GoblinDef> = {
  grunt: { hp: 115, speed: 4.9, damage: 20, scale: 1.02, score: 100, attackRange: 2.55, windup: 0.34, cooldown: 1.1, name: "Raider", voice: 0.95 },
  runner: { hp: 62, speed: 9.2, damage: 12, scale: 0.88, score: 130, attackRange: 2.1, windup: 0.18, cooldown: 0.65, name: "Stalker", voice: 1.4 },
  brute: { hp: 480, speed: 3.2, damage: 38, scale: 1.65, score: 420, attackRange: 3.4, windup: 0.48, cooldown: 1.35, name: "Enforcer", voice: 0.55 },
  shaman: { hp: 145, speed: 3.3, damage: 18, scale: 1.05, score: 260, attackRange: 28, windup: 0.85, cooldown: 2.5, name: "Hexer", voice: 1.1 },
  king: { hp: 3800, speed: 3.9, damage: 46, scale: 2.85, score: 5000, attackRange: 4.4, windup: 0.55, cooldown: 1.15, name: "KRAWK THE GOBLIN KING", voice: 0.4 },
};

export const GEEZER: GoblinDef = {
  hp: 90, speed: 7.6, damage: 11, scale: 1.02, score: 150, attackRange: 1.9, windup: 0.24, cooldown: 0.72, name: "Emo Girl", voice: 1.45,
};

export const DINOS: Record<DinoKind, GoblinDef> = {
  raptor: { hp: 95, speed: 10.5, damage: 22, scale: 1.05, score: 180, attackRange: 2.35, windup: 0.2, cooldown: 0.55, name: "Raptor", voice: 1.35 },
  dilo: { hp: 130, speed: 5.8, damage: 16, scale: 1.1, score: 240, attackRange: 22, windup: 0.7, cooldown: 2.1, name: "Dilophosaurus", voice: 1.15 },
  trex: { hp: 2200, speed: 4.4, damage: 55, scale: 2.6, score: 3500, attackRange: 4.2, windup: 0.5, cooldown: 1.25, name: "T-Rex", voice: 0.45 },
};

export const HOSTILES: Record<HostileKind, GoblinDef> = { ...GOBLINS, geezer: GEEZER, ...DINOS };

const DINO_KINDS = new Set<HostileKind>(["raptor", "dilo", "trex"]);

function factionOf(kind: HostileKind): Faction {
  if (kind === "geezer") return "geezer";
  if (DINO_KINDS.has(kind)) return "dino";
  return "goblin";
}

type State = "rising" | "chase" | "windup" | "recover" | "dead";

export interface Goblin {
  id: number;
  kind: HostileKind;
  faction: Faction;
  def: GoblinDef;
  rig: GoblinRig;
  pos: THREE.Vector3;
  yaw: number;
  hp: number;
  state: State;
  stateT: number;
  phase: number;
  hurtT: number;
  attackCd: number;
  stuckT: number;
  lastPos: THREE.Vector3;
  sidestep: number;
  sidestepT: number;
  deadVel: THREE.Vector3;
  deadSpin: THREE.Vector3;
  deadT: number;
  headless: boolean;
  headGib: THREE.Object3D | null;
  headGibVel: THREE.Vector3;
  alerted: boolean;
  summonT: number;
  dummy: boolean;
  tauntT: number;
  losT: number;
  losClear: boolean;
  targetId: number | "player" | null;
  hpBar: THREE.Sprite;
}

export interface Projectile {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  kind: "orb" | "acid";
  ownerKind: HostileKind;
  ownerId: number;
  /** Homing toward player eye, or a rival body if set. */
  seekRival: Goblin | null;
}

export interface GoblinHit {
  goblin: Goblin;
  dist: number;
  head: boolean;
  point: THREE.Vector3;
}

const orbGeo = new THREE.IcosahedronGeometry(0.28, 1);
const orbMat = new THREE.MeshBasicMaterial({ color: "#c27bff" });
const acidGeo = new THREE.SphereGeometry(0.22, 8, 6);
const acidMat = new THREE.MeshBasicMaterial({ color: "#7cff3a" });

export class GoblinManager {
  readonly group = new THREE.Group();
  readonly goblins: Goblin[] = [];
  readonly projectiles: Projectile[] = [];
  private nextId = 1;
  onPlayerHit?: (damage: number, from: THREE.Vector3) => void;
  onKilled?: (g: Goblin, by: "player" | "rival") => void;
  onTaunt?: (g: Goblin) => void;
  onSummon?: (x: number, z: number) => void;

  private readonly flow: FlowField;

  constructor(
    private readonly collision: CollisionWorld,
    private readonly fx: Effects,
    private readonly audio: AudioEngine,
  ) {
    this.flow = new FlowField(collision, collision.terrain.size);
  }

  get alive() {
    return this.goblins.filter((g) => g.state !== "dead" && !g.dummy);
  }

  spawn(kind: HostileKind, x: number, z: number, opts: { dummy?: boolean; instant?: boolean } = {}): Goblin {
    const def = HOSTILES[kind];
    const faction = factionOf(kind);
    const rig = kind === "geezer" ? buildGeezer() : DINO_KINDS.has(kind) ? buildDino(kind as DinoKind) : buildGoblin(kind as GoblinKind);
    rig.root.scale.setScalar(def.scale);
    rig.root.rotation.order = "YXZ";
    const y = this.collision.groundAt(x, z);
    const hpBar = makeHealthBar(1.1 + def.scale * 0.25, 0.11 + def.scale * 0.02);
    hpBar.position.set(0, 2.15 * def.scale, 0);
    rig.root.add(hpBar);
    updateHealthBar(hpBar, def.hp, def.hp, true);
    const g: Goblin = {
      id: this.nextId++, kind, faction, def, rig,
      pos: new THREE.Vector3(x, y, z), yaw: Math.random() * Math.PI * 2, hp: def.hp,
      state: opts.instant ? "chase" : "rising", stateT: 0, phase: Math.random() * 10, hurtT: 0,
      attackCd: 1 + Math.random(), stuckT: 0, lastPos: new THREE.Vector3(x, y, z), sidestep: 0, sidestepT: 0,
      deadVel: new THREE.Vector3(), deadSpin: new THREE.Vector3(), deadT: 0, headless: false, headGib: null,
      headGibVel: new THREE.Vector3(), alerted: false, summonT: 8, dummy: !!opts.dummy, tauntT: 4 + Math.random() * 10,
      losT: Math.random() * 0.3, losClear: true, targetId: "player", hpBar,
    };
    rig.root.position.copy(g.pos);
    if (!opts.instant) {
      rig.root.position.y -= 1.8 * def.scale;
      this.fx.spawnBurst(g.pos.clone());
    }
    this.group.add(rig.root);
    this.goblins.push(g);
    return g;
  }

  /** Ray vs head spheres and body capsules (approximated as stacked spheres). */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): GoblinHit[] {
    const hits: GoblinHit[] = [];
    const tmp = new THREE.Vector3();
    const sphere = (c: THREE.Vector3, r: number) => {
      tmp.subVectors(origin, c);
      const b = tmp.dot(dir);
      const cc = tmp.lengthSq() - r * r;
      const disc = b * b - cc;
      if (disc < 0) return Infinity;
      const t = -b - Math.sqrt(disc);
      return t >= 0 && t <= maxDist ? t : Infinity;
    };
    for (const g of this.goblins) {
      if (g.state === "dead") continue;
      const s = g.def.scale;
      const rise = g.rig.root.position.y - g.pos.y;
      const base = new THREE.Vector3(g.pos.x, g.pos.y + rise, g.pos.z);
      if (base.distanceToSquared(origin) > (maxDist + 6) ** 2) continue;
      const headC = new THREE.Vector3();
      g.rig.head.getWorldPosition(headC);
      const th = g.headless ? Infinity : sphere(headC, 0.42 * s);
      let tb = Infinity;
      for (const [hy, r] of [[0.62, 0.26], [0.38, 0.24], [0.18, 0.18]] as const) {
        tb = Math.min(tb, sphere(base.clone().setY(base.y + hy * s), r * s));
      }
      // Prefer head when the ray grazes both — upper body used to swallow headshots.
      const head = th < Infinity && th <= tb + 0.28;
      const t = head ? th : tb;
      if (t < Infinity) hits.push({ goblin: g, dist: t, head, point: origin.clone().addScaledVector(dir, t) });
    }
    return hits.sort((a, b) => a.dist - b.dist);
  }

  /** Returns true if this hit killed the goblin. */
  damage(g: Goblin, amount: number, dir: THREE.Vector3, head: boolean, big: boolean, by: "player" | "rival" = "player"): boolean {
    if (g.state === "dead") return false;
    g.hp -= amount;
    g.hurtT = 0.25;
    g.alerted = true;
    updateHealthBar(g.hpBar, g.hp, g.def.hp, !g.dummy);
    const dist = g.pos.distanceTo(this.listener);
    if (g.hp > 0) {
      if (Math.random() < 0.6) this.voice(g, "hurt", dist);
      if (g.kind !== "king" && g.kind !== "brute" && g.kind !== "trex") {
        g.pos.addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), big ? 0.9 : 0.25);
      }
      return false;
    }
    this.kill(g, dir, head, big, by);
    return true;
  }

  private kill(g: Goblin, dir: THREE.Vector3, head: boolean, big: boolean, by: "player" | "rival" = "player") {
    g.state = "dead";
    g.deadT = 0;
    const force = (big ? 9 : 4.5) / Math.sqrt(g.def.scale);
    g.deadVel.set(dir.x, 0, dir.z).normalize().multiplyScalar(force);
    g.deadVel.y = big ? 5 : 2.5;
    g.deadSpin.set((Math.random() - 0.5) * 4 - 3, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4);
    g.hpBar.visible = false;
    const dist = g.pos.distanceTo(this.listener);
    const pan = this.panFor(g.pos);
    this.voice(g, "death", dist);
    if (g.faction !== "geezer") this.audio.gore(pan, dist);
    const headPos = new THREE.Vector3();
    g.rig.head.getWorldPosition(headPos);
    if (head && g.kind !== "king" && g.kind !== "trex") {
      g.headless = true;
      const gib = g.rig.head;
      gib.parent?.remove(gib);
      gib.position.copy(headPos);
      gib.scale.setScalar(g.def.scale);
      this.group.add(gib);
      g.headGib = gib;
      g.headGibVel.copy(dir).multiplyScalar(big ? 14 : 8).add(new THREE.Vector3(0, big ? 8 : 6, 0));
      this.hitFx(g, headPos, new THREE.Vector3(0, 1, 0), 2.2);
    } else {
      this.hitFx(g, headPos, dir, 1.4);
    }
    if (g.faction === "geezer") this.fx.bloodSplat(g.pos.x + dir.x * 1.2, g.pos.z + dir.z * 1.2, 1.2 * g.def.scale);
    else if (g.faction === "dino") this.fx.bloodSplat(g.pos.x + dir.x * 1.2, g.pos.z + dir.z * 1.2, 1.3 * g.def.scale);
    else this.fx.gooSplat(g.pos.x + dir.x * 1.2, g.pos.z + dir.z * 1.2, 1.4 * g.def.scale);
    this.onKilled?.(g, by);
  }

  private voice(g: Goblin, kind: "hurt" | "death" | "alert" | "attack" | "laugh", dist: number) {
    const pan = this.panFor(g.pos);
    if (g.faction === "geezer") this.audio.geezer(kind, g.def.voice, pan, dist);
    else this.audio.goblin(kind, g.def.voice, pan, dist);
  }

  private hitFx(g: Goblin, point: THREE.Vector3, dir: THREE.Vector3, amount: number) {
    if (g.faction === "goblin") this.fx.goo(point, dir, amount, g.pos.y);
    else this.fx.blood(point, dir, amount, g.pos.y);
  }

  private listener = new THREE.Vector3();
  private listenerYaw = 0;

  private panFor(p: THREE.Vector3) {
    const dx = p.x - this.listener.x, dz = p.z - this.listener.z;
    const rightX = Math.cos(this.listenerYaw), rightZ = -Math.sin(this.listenerYaw);
    const d = Math.hypot(dx, dz) || 1;
    return (dx * rightX + dz * rightZ) / d;
  }

  update(dt: number, player: Player, now: number) {
    this.listener.copy(player.pos);
    this.listenerYaw = player.yaw;
    const target = player.pos;
    this.flow.update(dt, target.x, target.z);

    for (let i = this.goblins.length - 1; i >= 0; i--) {
      const g = this.goblins[i];
      g.stateT += dt;
      g.hurtT = Math.max(0, g.hurtT - dt);
      const rig = g.rig;
      const s = g.def.scale;

      if (g.state === "dead") {
        g.hpBar.visible = false;
        this.updateDead(g, dt);
        if (g.deadT > 6) {
          this.group.remove(rig.root);
          if (g.headGib) this.group.remove(g.headGib);
          this.goblins.splice(i, 1);
        }
        continue;
      }

      updateHealthBar(g.hpBar, g.hp, g.def.hp, !g.dummy);

      if (g.state === "rising") {
        const k = Math.min(1, g.stateT / 0.9);
        rig.root.position.set(g.pos.x, g.pos.y - (1 - easeOut(k)) * 1.8 * s, g.pos.z);
        rig.root.rotation.y = g.yaw;
        if (k >= 1) {
          g.state = "chase";
          g.stateT = 0;
          if (Math.random() < 0.5) this.voice(g, "alert", g.pos.distanceTo(target));
        }
        this.animateLimbs(g, dt, 0.2);
        continue;
      }

      if (g.dummy) {
        rig.root.position.copy(g.pos);
        rig.root.rotation.y = g.yaw;
        this.animateLimbs(g, dt, 0);
        continue;
      }

      const aim = this.pickTarget(g, player);
      const dx = aim.x - g.pos.x, dz = aim.z - g.pos.z;
      const dist = Math.hypot(dx, dz);
      const desiredYaw = Math.atan2(-dx, -dz);
      g.yaw = lerpAngle(g.yaw, desiredYaw, 1 - Math.exp(-dt * 8));
      g.attackCd -= dt;

      g.tauntT -= dt;
      if (g.tauntT <= 0 && dist < 40) {
        g.tauntT = 12 + Math.random() * 18;
        if (Math.random() < 0.35) {
          this.voice(g, "laugh", dist);
          this.onTaunt?.(g);
        }
      }

      let moveSpeed = 0;
      const ranged = g.kind === "shaman" || g.kind === "dilo";
      if (g.state === "chase") {
        const preferred = ranged ? (g.kind === "dilo" ? 12 : 14) : Math.max(1.2, g.def.attackRange * 0.55);
        const los = !this.collision.lineBlocked(g.pos.x, g.pos.y + 1.2 * s, g.pos.z, aim.x, aim.y, aim.z);
        const canAttack = dist < g.def.attackRange && los && (aim.rival || player.alive);
        if (canAttack && g.attackCd <= 0) {
          g.state = "windup";
          g.stateT = 0;
          this.voice(g, "attack", dist);
        } else if (dist > preferred) {
          moveSpeed = g.def.speed * (g.hurtT > 0 ? 0.45 : 1);
          if (ranged && dist < 9) moveSpeed = -g.def.speed * 0.75;
        } else if ((g.kind === "geezer" || g.kind === "raptor") && dist < 6) {
          g.sidestep = g.sidestep || (Math.random() < 0.5 ? -1 : 1);
          if (g.sidestepT <= 0) g.sidestepT = 0.8 + Math.random();
          moveSpeed = g.def.speed * 0.35;
        }
        if (g.kind === "king") {
          g.summonT -= dt;
          if (g.summonT <= 0) {
            g.summonT = 11;
            this.audio.goblin("laugh", 0.35, 0, dist);
            this.onSummon?.(g.pos.x, g.pos.z);
          }
        }
      } else if (g.state === "windup") {
        if (g.stateT >= g.def.windup) {
          this.resolveAttack(g, player, dist, now, aim.rival);
          g.state = "recover";
          g.stateT = 0;
          g.attackCd = g.def.cooldown * (0.8 + Math.random() * 0.4);
        }
      } else if (g.state === "recover") {
        if (g.stateT > 0.28) { g.state = "chase"; g.stateT = 0; }
      }

      if (moveSpeed !== 0 && dist > 0.01) {
        g.losT -= dt;
        if (g.losT <= 0) {
          g.losT = 0.3;
          g.losClear = !this.collision.lineBlocked(g.pos.x, g.pos.y + 0.8 * s, g.pos.z, aim.x, aim.y, aim.z);
        }
        let mx = (dx / dist) * Math.sign(moveSpeed), mz = (dz / dist) * Math.sign(moveSpeed);
        if (moveSpeed > 0 && !g.losClear && !aim.rival) {
          const f = this.flow.direction(g.pos.x, g.pos.z);
          if (f) {
            mx = f[0];
            mz = f[1];
            g.yaw = lerpAngle(g.yaw, Math.atan2(-mx, -mz), 1 - Math.exp(-dt * 6));
          }
        }
        for (const o of this.goblins) {
          if (o === g || o.state === "dead") continue;
          const ox = g.pos.x - o.pos.x, oz = g.pos.z - o.pos.z;
          const od = Math.hypot(ox, oz);
          const minD = (g.def.scale + o.def.scale) * 0.55;
          if (od < minD && od > 0.001) { mx += (ox / od) * (minD - od) * 2; mz += (oz / od) * (minD - od) * 2; }
        }
        if (g.sidestepT > 0) {
          g.sidestepT -= dt;
          mx += -dz / dist * g.sidestep * 1.4;
          mz += dx / dist * g.sidestep * 1.4;
        }
        const ml = Math.hypot(mx, mz) || 1;
        const sp = Math.abs(moveSpeed);
        g.pos.x += (mx / ml) * sp * dt;
        g.pos.z += (mz / ml) * sp * dt;
        this.collision.resolve(g.pos, 0.38 * s, 1.4 * s);
        g.pos.y = this.collision.terrain.heightAt(g.pos.x, g.pos.z);

        g.stuckT += dt;
        if (g.stuckT > 1.1) {
          if (g.pos.distanceTo(g.lastPos) < 0.6 * sp * 0.3 && g.sidestepT <= 0) {
            g.sidestep = Math.random() < 0.5 ? -1 : 1;
            g.sidestepT = 1.4;
          }
          g.lastPos.copy(g.pos);
          g.stuckT = 0;
        }
      }

      rig.root.position.copy(g.pos);
      rig.root.rotation.y = g.yaw;
      this.animateLimbs(g, dt, moveSpeed !== 0 ? Math.abs(moveSpeed) / 4.5 : 0);
      if (g.kind === "shaman" && rig.root.userData.orb) this.fx.magic((rig.root.userData.orb as THREE.Object3D).getWorldPosition(new THREE.Vector3()), 0xb06bff);
      if (g.kind === "dilo" && rig.root.userData.frill) {
        const frill = rig.root.userData.frill as THREE.Object3D;
        const open = g.state === "windup" || g.state === "recover" ? 1 : 0.35;
        frill.scale.x += (open * 1.1 - frill.scale.x) * Math.min(1, dt * 8);
        frill.scale.y += (open * 1.2 - frill.scale.y) * Math.min(1, dt * 8);
      }
    }

    this.updateProjectiles(dt, player, now);
  }

  private pickTarget(g: Goblin, player: Player) {
    const playerDist = Math.hypot(player.pos.x - g.pos.x, player.pos.z - g.pos.z);
    let best: Goblin | null = null;
    let bestD = Infinity;
    for (const o of this.goblins) {
      // Same kind only — every other class (goblin subtypes, emos, dinos) is fair game.
      if (o === g || o.state === "dead" || o.dummy || o.kind === g.kind) continue;
      const d = Math.hypot(o.pos.x - g.pos.x, o.pos.z - g.pos.z);
      if (d < bestD) { bestD = d; best = o; }
    }
    const wantRival = !!best && bestD < 44 && (bestD < playerDist + 12 || bestD < 24 || !player.alive);
    if (wantRival && best) {
      g.targetId = best.id;
      return { x: best.pos.x, y: best.pos.y + 1.3 * best.def.scale, z: best.pos.z, rival: best, dist: bestD };
    }
    g.targetId = "player";
    return { x: player.pos.x, y: player.pos.y + 1.5, z: player.pos.z, rival: null as Goblin | null, dist: playerDist };
  }

  private resolveAttack(g: Goblin, player: Player, dist: number, _now: number, rival: Goblin | null) {
    if (!rival && (g.kind === "king" || g.kind === "trex") && dist < (g.kind === "trex" ? 7.2 : 6.8)) {
      this.fx.ring(g.pos.clone(), g.kind === "trex" ? 10 : 9, 0.55, g.kind === "trex" ? 0xff4020 : 0xff6a00);
      this.fx.soft.emit({ pos: g.pos.clone(), spread: 1, speed: [4, 10], life: [0.6, 1.2], size: [0.6, 2.4], color: 0x7a6a50, color2: 0x3a3020, alpha: 0.7, gravity: 4, count: 40, jitter: 3 });
      this.audio.explosion(dist);
      player.shake(0.5);
      if (player.onGround) this.onPlayerHit?.(g.def.damage, g.pos);
      return;
    }
    if (g.kind === "shaman" || g.kind === "dilo") {
      this.launchProjectile(g, player, rival);
      return;
    }
    this.spearThrust(g, player, rival, dist);
  }

  private launchProjectile(g: Goblin, player: Player, rival: Goblin | null) {
    const s = g.def.scale;
    const from = new THREE.Vector3();
    if (g.rig.muzzle) g.rig.muzzle.getWorldPosition(from);
    else from.set(g.pos.x, g.pos.y + 1.6 * s, g.pos.z);
    const aim = rival
      ? new THREE.Vector3(rival.pos.x, rival.pos.y + 1.2 * rival.def.scale, rival.pos.z)
      : player.eyePos.clone().add(new THREE.Vector3(0, -0.3, 0));
    const speed = g.kind === "dilo" ? 19 : 17;
    const vel = aim.sub(from).normalize().multiplyScalar(speed);
    const acid = g.kind === "dilo";
    const mesh = new THREE.Mesh(acid ? acidGeo : orbGeo, acid ? acidMat : orbMat);
    mesh.position.copy(from);
    this.group.add(mesh);
    this.projectiles.push({
      mesh, vel, life: acid ? 3.2 : 4, damage: g.def.damage,
      kind: acid ? "acid" : "orb", ownerKind: g.kind, ownerId: g.id, seekRival: rival,
    });
    this.audio.fireball(this.panFor(g.pos));
  }

  private spearThrust(g: Goblin, player: Player, rival: Goblin | null, dist: number) {
    const reach = g.def.attackRange + 0.35 * g.def.scale;
    const dir = new THREE.Vector3();
    if (rival) dir.set(rival.pos.x - g.pos.x, 0, rival.pos.z - g.pos.z);
    else dir.set(player.pos.x - g.pos.x, 0, player.pos.z - g.pos.z);
    if (dir.lengthSq() < 0.0001) return;
    dir.normalize();
    const tip = new THREE.Vector3();
    if (g.rig.muzzle) g.rig.muzzle.getWorldPosition(tip);
    else tip.set(g.pos.x, g.pos.y + 1.1 * g.def.scale, g.pos.z).addScaledVector(dir, 1.2);

    if (rival && dist <= reach + 0.6) {
      this.damage(rival, g.def.damage, dir, false, g.kind === "brute" || g.kind === "king" || g.kind === "trex", "rival");
      this.hitFx(rival, tip, dir, 0.7);
      return;
    }
    if (!rival && player.alive && dist <= reach) {
      this.onPlayerHit?.(g.def.damage, g.pos);
      this.fx.blood(player.eyePos.clone().addScaledVector(dir, -0.35), dir.clone().negate(), g.kind === "king" || g.kind === "trex" ? 0.9 : 0.45, player.pos.y);
    }
  }

  private updateProjectiles(dt: number, player: Player, _now: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const seekingRival = !!(p.seekRival && p.seekRival.state !== "dead");
      const seek = seekingRival
        ? new THREE.Vector3(p.seekRival!.pos.x, p.seekRival!.pos.y + 1.2 * p.seekRival!.def.scale, p.seekRival!.pos.z)
        : player.eyePos.clone();
      const to = seek.sub(p.mesh.position);
      const home = p.kind === "acid" ? 4 : 6;
      if (to.lengthSq() > 0.001) p.vel.addScaledVector(to.normalize(), dt * home);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 11;
      const trail = p.kind === "acid" ? 0x7cff3a : 0xb06bff;
      const c1 = p.kind === "acid" ? 0xb8ff60 : 0xd9a6ff;
      const c2 = p.kind === "acid" ? 0x2a8010 : 0x5a00ff;
      this.fx.magic(p.mesh.position, trail);
      this.fx.add.emit({ pos: p.mesh.position, spread: 1, speed: [0, 0.5], life: [0.25, 0.45], size: [0.5, 0.05], color: c1, color2: c2, count: 2 });

      let hitRival: Goblin | null = null;
      for (const o of this.goblins) {
        if (o.state === "dead" || o.dummy || o.id === p.ownerId || o.kind === p.ownerKind) continue;
        const d = Math.hypot(o.pos.x - p.mesh.position.x, o.pos.z - p.mesh.position.z);
        const dy = Math.abs(o.pos.y + 1.1 * o.def.scale - p.mesh.position.y);
        if (d < 0.9 * o.def.scale && dy < 1.4 * o.def.scale) { hitRival = o; break; }
      }
      const hitPlayer = !seekingRival && player.alive && p.mesh.position.distanceTo(player.eyePos) < 1.0;
      const ground = this.collision.groundAt(p.mesh.position.x, p.mesh.position.z);
      const hitWorld = p.mesh.position.y < ground || !!this.collision.buildingAt(p.mesh.position.x, p.mesh.position.z);
      if (hitRival || hitPlayer || hitWorld || p.life <= 0) {
        if (hitPlayer) this.onPlayerHit?.(p.damage, p.mesh.position.clone());
        if (hitRival) {
          const dir = new THREE.Vector3().subVectors(hitRival.pos, p.mesh.position).normalize();
          this.damage(hitRival, p.damage, dir, false, false, "rival");
          this.hitFx(hitRival, p.mesh.position.clone(), dir, 0.8);
        }
        this.fx.add.emit({ pos: p.mesh.position, spread: 1, speed: [2, 8], life: [0.2, 0.6], size: [0.6, 0.05], color: c1, color2: c2, count: 30 });
        this.fx.flash(p.mesh.position, p.kind === "acid" ? 0x6dff20 : 0xa04dff, 30, 0.25, 15);
        this.group.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private animateLimbs(g: Goblin, dt: number, speed01: number) {
    const r = g.rig;
    g.phase += dt * (4 + speed01 * 6);
    const sw = Math.sin(g.phase) * Math.min(1, speed01) * 0.85;
    r.legL.rotation.x = sw;
    r.legR.rotation.x = -sw;
    r.armL.rotation.x = -sw * 0.8;
    r.body.position.y = Math.abs(Math.cos(g.phase)) * 0.06 * Math.min(1, speed01);
    r.torso.rotation.x = -0.18 * Math.min(1, speed01) - (g.hurtT > 0 ? -0.35 * (g.hurtT / 0.25) : 0);
    r.jaw.rotation.x = 0.15 + Math.sin(g.phase * 1.7) * 0.12;
    r.head.rotation.z = Math.sin(g.phase * 0.5) * 0.08;

    if (g.state === "windup") {
      const k = Math.min(1, g.stateT / g.def.windup);
      const draw = k < 0.55 ? easeOut(k / 0.55) : 1 - easeOut((k - 0.55) / 0.45);
      r.armR.rotation.x = -2.15 * draw + (k > 0.55 ? -0.4 : 0);
      r.armR.rotation.z = 0.35 * draw;
      r.torso.rotation.x += -0.25 * draw;
      r.jaw.rotation.x = 0.55;
      r.eyeMat.emissiveIntensity = 5 + k * 8;
    } else if (g.state === "recover") {
      const k = Math.min(1, g.stateT / 0.12);
      r.armR.rotation.x = -0.85 + 0.5 * easeOut(k);
      r.eyeMat.emissiveIntensity = 5;
    } else {
      const hold = -0.55 - Math.min(1, speed01) * 0.25;
      r.armR.rotation.x += (hold - r.armR.rotation.x) * 0.18;
      r.armR.rotation.z *= 0.85;
    }
  }

  private updateDead(g: Goblin, dt: number) {
    g.deadT += dt;
    const r = g.rig;
    const ground = this.collision.terrain.heightAt(g.pos.x, g.pos.z);
    if (g.deadT < 2.5) {
      g.deadVel.y -= 20 * dt;
      g.pos.addScaledVector(g.deadVel, dt);
      if (g.pos.y < ground) {
        g.pos.y = ground;
        g.deadVel.multiplyScalar(0.4);
        g.deadVel.y = Math.abs(g.deadVel.y) * 0.2;
        g.deadSpin.multiplyScalar(0.5);
      }
      const targetX = Math.PI / 2;
      r.root.rotation.x += (targetX - r.root.rotation.x) * Math.min(1, dt * 6);
      r.root.rotation.z += g.deadSpin.z * dt;
      r.legL.rotation.x += (0.3 - r.legL.rotation.x) * dt * 4;
      r.armL.rotation.x += (-2.8 - r.armL.rotation.x) * dt * 4;
      r.armR.rotation.x += (-2.6 - r.armR.rotation.x) * dt * 4;
      r.eyeMat.emissiveIntensity = Math.max(0, 4 - g.deadT * 6);
      if (g.headless && g.deadT < 1.2) {
        const neck = new THREE.Vector3();
        r.torso.getWorldPosition(neck);
        this.hitFx(g, neck.add(new THREE.Vector3(0, 0.4 * g.def.scale, 0)), new THREE.Vector3(0, 1, 0), 0.25);
      }
    } else if (g.deadT > 4) {
      g.pos.y -= dt * 0.6;
    }
    r.root.position.copy(g.pos).add(new THREE.Vector3(0, 0.25 * g.def.scale, 0));
    if (g.headGib) {
      g.headGibVel.y -= 20 * dt;
      g.headGib.position.addScaledVector(g.headGibVel, dt);
      g.headGib.rotation.x += dt * 9;
      g.headGib.rotation.z += dt * 5;
      const gy = this.collision.terrain.heightAt(g.headGib.position.x, g.headGib.position.z) + 0.2 * g.def.scale;
      if (g.headGib.position.y < gy) {
        g.headGib.position.y = gy;
        if (Math.abs(g.headGibVel.y) > 2) this.fx.gooSplat(g.headGib.position.x, g.headGib.position.z, 0.8);
        g.headGibVel.multiplyScalar(0.45);
        g.headGibVel.y = Math.abs(g.headGibVel.y);
      }
    }
  }

  clear() {
    for (const g of this.goblins) {
      this.group.remove(g.rig.root);
      if (g.headGib) this.group.remove(g.headGib);
    }
    this.goblins.length = 0;
    for (const p of this.projectiles) this.group.remove(p.mesh);
    this.projectiles.length = 0;
  }
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
