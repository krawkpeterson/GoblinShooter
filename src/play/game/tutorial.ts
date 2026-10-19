import * as THREE from "three";
import type { AudioEngine } from "../audio/audio.ts";
import type { Goblin, GoblinManager } from "../enemies/goblins.ts";
import type { Player } from "../player/player.ts";
import type { Hud } from "../ui/hud.ts";
import type { WeaponSystem } from "../weapons/weapons.ts";
import type { CollisionWorld } from "../world/collision.ts";

interface Step {
  objective: string;
  line: string;
  roasts: string[];
  enter?: () => void;
  done: () => boolean;
  minTime?: number;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Sgt. Grimsby's boot camp. He is not here to make you feel good. */
export class Tutorial {
  private steps: Step[];
  private i = -1;
  private t = 0;
  private idleT = 0;
  private roastIdx = 0;
  shame = 12;
  private lookAccum = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private jumpsAtStart = 0;
  private reloadsAtStart = 0;
  private beacon: THREE.Group;
  private beaconPos = new THREE.Vector3();
  private dummies: Goblin[] = [];
  private live: Goblin | null = null;
  private magnumKill = false;
  private adsHeadshot = false;
  private misses = 0;
  private sprintStartDist = 0;
  done = false;
  onComplete?: (shame: number) => void;
  sightBlocked?: (from: THREE.Vector3, to: THREE.Vector3) => boolean;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly player: Player,
    private readonly weapons: WeaponSystem,
    private readonly goblins: GoblinManager,
    private readonly hud: Hud,
    private readonly audio: AudioEngine,
    private readonly collision: CollisionWorld,
    private readonly place: string,
  ) {
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 60, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xb6ff1f, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 30;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.0, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xb6ff1f, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.position.y = 0.15;
    this.beacon.add(beam, ring);
    this.beacon.visible = false;
    scene.add(this.beacon);

    const P = place;
    this.steps = [
      {
        objective: "Stand there and absorb the disappointment",
        line: `Listen up, maggot. Welcome to ${P}. The goblins took it, and the Pentagon sent... you. I've seen tougher recruits in a petting zoo.`,
        roasts: [],
        done: () => this.t > 6.5,
      },
      {
        objective: "Look around with the MOUSE",
        line: "Move the mouse. Look around. That's the plastic thing your hand is resting on like a dead fish.",
        roasts: [
          "Any day now. The mouse. It moves. Like you should.",
          "Are you buffering? Is your brain on dial-up?",
          "My grandmother looks around faster, and she's been dead since 2009.",
        ],
        enter: () => { this.lookAccum = 0; },
        done: () => this.lookAccum > 4,
      },
      {
        objective: "Walk to the green beacon (W A S D)",
        line: "W-A-S-D. Walk to the beacon. It's the giant glowing pillar. Even you can't miss it. Probably.",
        roasts: [
          "It's a GIANT GLOWING PILLAR. You are walking like a Roomba with a head injury.",
          "Did you hear me or are those ears decorative?",
          "I've watched paint dry with more forward momentum.",
        ],
        enter: () => this.placeBeacon(14),
        done: () => this.atBeacon(),
      },
      {
        objective: "Jump 3 times (SPACE)",
        line: "Jump. Three times. Space bar. Let's see that vertical leap.",
        roasts: [
          "That's not jumping, that's a hiccup.",
          "Your vertical leap is a rounding error.",
          "Space bar. The big one. The biggest key on the keyboard. Come on.",
        ],
        enter: () => { this.jumpsAtStart = this.player.jumps; this.beacon.visible = false; },
        done: () => this.player.jumps - this.jumpsAtStart >= 3,
      },
      {
        objective: "SPRINT to the next beacon (hold SHIFT)",
        line: "Now SPRINT to the next beacon. Hold Shift. Run like the goblins found your browser history.",
        roasts: [
          "That's a sprint? I've seen glaciers with more hustle.",
          "Hold. Shift. Are you allergic to the shift key?",
          "You run like you're carrying all my disappointment. Which you are.",
        ],
        enter: () => { this.placeBeacon(32); this.sprintStartDist = this.player.sprintDistance; },
        done: () => this.atBeacon() && this.player.sprintDistance - this.sprintStartDist > 10,
      },
      {
        objective: "Shoot the 3 practice goblins with the 1911 (LEFT CLICK)",
        line: "That's a double-stack 1911. Fourteen rounds of .45 ACP. Three practice goblins. Left click. Try to hit something other than the sky.",
        roasts: [
          "They are standing STILL. They're DUMMIES. Like you, but useful.",
          "Aim with your eyes, not your hopes and dreams.",
          "Every round you miss is now a resident of " + P + ". Pays more taxes than you.",
        ],
        enter: () => {
          this.beacon.visible = false;
          this.weapons.switchTo(0);
          this.dummies = [-0.35, 0, 0.35].map((a) => this.spawnAhead(13 + Math.random() * 5, a, "grunt", true));
        },
        done: () => this.dummies.every((d) => d.state === "dead"),
      },
      {
        objective: "Reload (R)",
        line: "Reload. Press R. Counting to fourteen is hard, I know. Use your fingers. And toes.",
        roasts: ["R. The letter R. As in 'Really? Still?'", "Your magazine is as empty as your résumé."],
        enter: () => { this.reloadsAtStart = this.weapons.reloadsDone; const g = this.weapons.guns[0]; if (g.ammo === g.def.mag) g.ammo = Math.max(3, g.ammo - 6); },
        done: () => this.weapons.reloadsDone > this.reloadsAtStart,
      },
      {
        objective: "Switch to the Colt Anaconda (2 or Q)",
        line: "Press 2. That's a Colt Anaconda. Point four four Magnum. Respect it. It certainly doesn't respect you.",
        roasts: ["Two. The number after one. You've been one for too long.", "Q works too. Pick a key. Any key. Please."],
        done: () => this.weapons.current === 1 && this.weapons.state === "idle",
      },
      {
        objective: "Kill the goblin with the Magnum",
        line: "One goblin. One Magnum round. Squeeze the trigger and listen to what competence sounds like.",
        roasts: [
          "You're shooting a hand cannon like it owes you money and you're scared to ask.",
          "Six rounds. Not sixty. Make them count.",
        ],
        enter: () => { this.magnumKill = false; this.dummies = [this.spawnAhead(22, 0.1, "brute", true)]; },
        done: () => this.magnumKill,
      },
      {
        objective: "Aim down sights (RIGHT CLICK) and HEADSHOT the far goblin",
        line: "Right click to aim down the sights. Far goblin. Headshot only. Yes, the head is the round thing on top.",
        roasts: [
          "HEAD. Shot. Not toe shot. Not 'somewhere near Ohio' shot.",
          "Hold right click and line up the glowing dots. It's a coloring book with consequences.",
          "Even the dummy is embarrassed for you.",
        ],
        enter: () => { this.adsHeadshot = false; this.dummies = [this.spawnAhead(34, -0.05, "grunt", true)]; },
        done: () => this.adsHeadshot,
      },
      {
        objective: "Kill the LIVE goblin. Don't cry.",
        line: "This one's real. It moves, it bites, and it's been eating " + P + " residents all week. Kill it. Don't cry.",
        roasts: ["It's ONE goblin. It's four feet tall. You are losing to a lawn ornament.", "Shoot it. With the gun. The gun in your hands."],
        enter: () => { this.live = this.spawnAhead(28, 0.4, "grunt", false); },
        done: () => !!this.live && this.live.state === "dead",
      },
    ];
  }

  /** Nearest point roughly `dist` ahead that is outside buildings and in clear line of sight. */
  private openSpot(dist: number, angle: number): [number, number] {
    const eyeY = this.player.pos.y + 1.6;
    for (const scale of [1, 0.8, 0.6, 0.45]) {
      for (let k = 0; k <= 20; k++) {
        const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.3;
        const yaw = this.player.yaw + angle + off;
        const d = dist * scale;
        const x = this.player.pos.x - Math.sin(yaw) * d;
        const z = this.player.pos.z - Math.cos(yaw) * d;
        if (this.collision.buildingAt(x, z)) continue;
        const ty = this.collision.groundAt(x, z) + 1.2;
        if (this.collision.lineBlocked(this.player.pos.x, eyeY, this.player.pos.z, x, ty, z)) continue;
        if (this.sightBlocked?.(new THREE.Vector3(this.player.pos.x, eyeY, this.player.pos.z), new THREE.Vector3(x, ty, z))) continue;
        return [x, z];
      }
    }
    const yaw = this.player.yaw + angle;
    return [this.player.pos.x - Math.sin(yaw) * dist * 0.4, this.player.pos.z - Math.cos(yaw) * dist * 0.4];
  }

  private spawnAhead(dist: number, angle: number, kind: "grunt" | "brute", dummy: boolean): Goblin {
    const [x, z] = this.openSpot(dist, angle);
    const g = this.goblins.spawn(kind, x, z, { dummy });
    g.yaw = Math.atan2(-(this.player.pos.x - x), -(this.player.pos.z - z));
    return g;
  }

  private placeBeacon(dist: number) {
    const [x, z] = this.openSpot(dist, 0);
    this.beaconPos.set(x, this.collision.groundAt(x, z), z);
    this.beacon.position.copy(this.beaconPos);
    this.beacon.visible = true;
  }

  private atBeacon() {
    return Math.hypot(this.player.pos.x - this.beaconPos.x, this.player.pos.z - this.beaconPos.z) < 2.6;
  }

  start() {
    this.faceOpenGround();
    this.lastYaw = this.player.yaw;
    this.lastPitch = this.player.pitch;
    this.next();
  }

  private faceOpenGround() {
    const { x, y, z } = this.player.pos;
    let best = this.player.yaw, bestRun = -1;
    for (let k = 0; k < 24; k++) {
      const yaw = this.player.yaw + (k / 24) * Math.PI * 2;
      let run = 0;
      for (let d = 3; d <= 45; d += 3) {
        const px = x - Math.sin(yaw) * d, pz = z - Math.cos(yaw) * d;
        if (this.collision.buildingAt(px, pz) || this.collision.lineBlocked(x, y + 1.6, z, px, this.collision.groundAt(px, pz) + 1.2, pz)) break;
        run = d;
      }
      if (run > bestRun) { bestRun = run; best = yaw; }
    }
    this.player.yaw = best;
  }

  private next() {
    this.i++;
    this.t = 0;
    this.idleT = 0;
    this.roastIdx = 0;
    if (this.i >= this.steps.length) return this.finish();
    const s = this.steps[this.i];
    s.enter?.();
    this.say(s.line);
    this.hud.objective(s.objective);
  }

  private say(line: string) {
    this.hud.sarge(line, this.shame);
    this.audio.say(line, { pitch: 0.55, rate: 1.08 });
  }

  notifyShot(hit: boolean) {
    if (this.done || this.i < 5) return;
    if (!hit) {
      this.misses++;
      this.shame = Math.min(100, this.shame + 3);
      if (this.misses % 3 === 0) {
        this.say(pick([
          `Missed. That bullet is now a permanent resident of ${this.place}.`,
          "Miss. Miss. MISS. Are you shooting or just making noise?",
          "Wow. The goblin didn't even flinch. It's laughing at you. I'm laughing at you.",
          "Do you need me to hold it still for you? Oh wait. It IS still.",
        ]));
      }
    }
  }

  notifyKill(g: Goblin, head: boolean, weapon: string) {
    if (this.done) return;
    if ((weapon === "anaconda" || weapon === "ruger") && this.i === 8) {
      this.magnumKill = true;
      this.hud.sarge("THAT is the sound of competence. Unfortunately, it came from the gun, not you.", this.shame);
    }
    if (this.i === 9 && head && this.weapons.adsAmount > 0.5) this.adsHeadshot = true;
    else if (this.i === 9 && g.dummy) {
      this.shame = Math.min(100, this.shame + 8);
      this.say("I said HEADSHOT. And aim down the sights. Here's another one, sweetheart.");
      this.dummies = [this.spawnAhead(34, (Math.random() - 0.5) * 0.4, "grunt", true)];
    }
  }

  notifyDamage() {
    if (this.done) return;
    this.shame = Math.min(100, this.shame + 6);
    if (Math.random() < 0.4) this.say("You're getting bit by a goblin the size of a fire hydrant. Pathetic.");
  }

  notifyDeath() {
    this.shame = 100;
    this.say("You died. In the TUTORIAL. I'm putting that on your tombstone. Get up.");
  }

  update(dt: number) {
    if (this.done || this.i < 0) return;
    this.t += dt;
    this.idleT += dt;
    const dy = Math.abs(this.player.yaw - this.lastYaw) + Math.abs(this.player.pitch - this.lastPitch);
    this.lookAccum += dy;
    this.lastYaw = this.player.yaw;
    this.lastPitch = this.player.pitch;

    if (this.beacon.visible) {
      this.beacon.rotation.y += dt;
      (this.beacon.children[1] as THREE.Mesh).scale.setScalar(1 + Math.sin(this.t * 4) * 0.12);
    }

    const s = this.steps[this.i];
    if (s.done() && this.t > (s.minTime ?? 1.2)) {
      if (this.i > 0) this.audio.sting(1);
      this.next();
      return;
    }
    if (s.roasts.length && this.idleT > 9) {
      this.idleT = 0;
      this.shame = Math.min(100, this.shame + 5);
      this.say(s.roasts[this.roastIdx++ % s.roasts.length]);
    }
  }

  private finish() {
    this.done = true;
    this.beacon.visible = false;
    this.hud.objective(null);
    const s = Math.round(this.shame);
    const grade =
      s < 20 ? "B-minus. Don't let it go to your head. There's plenty of room in there." :
      s < 40 ? "C. Average. Like your haircut." :
      s < 65 ? "D. You're a liability with a pistol." :
      "F. I've seen better aim from a Roomba with a pool noodle.";
    this.say(`Boot camp complete. Shame rating: ${s} percent. Grade: ${grade} Now get out there. The goblins are less disappointed in you than I am.`);
    setTimeout(() => this.hud.sarge(null), 9000);
    this.onComplete?.(s);
  }

  dispose() {
    this.scene.remove(this.beacon);
  }
}
