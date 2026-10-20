import * as THREE from "three";
import type { AudioEngine } from "../audio/audio.ts";
import type { Input } from "../engine/input.ts";
import type { CollisionWorld } from "../world/collision.ts";

const WALK = 6.4;
const SPRINT = 10.2;
const CROUCH = 3.2;
const GRAVITY = 22;
const JUMP = 7.6;
const RADIUS = 0.42;

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  sprinting = false;
  crouching = false;
  ads = false;
  health = 100;
  readonly maxHealth = 100;
  lastDamageAt = -99;
  alive = true;
  jumps = 0;
  distanceMoved = 0;
  sprintDistance = 0;

  private eye = 1.68;
  private bobPhase = 0;
  private bobAmt = 0;
  private stepAccum = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private trauma = 0;
  private fovKick = 0;
  private fallSpeed = 0;
  private time = 0;
  frozen = false;

  constructor(private readonly collision: CollisionWorld, private readonly audio: AudioEngine) {}

  spawn(x: number, z: number) {
    this.pos.set(x, this.collision.groundAt(x, z) + 0.1, z);
    this.vel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.alive = true;
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  kick(pitch: number, yaw: number, trauma: number, fov = 0) {
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitch * 0.72, -1.5, 1.5);
    this.yaw += yaw;
    this.recoilPitch += pitch * 0.55;
    this.recoilYaw += yaw * 0.7;
    this.trauma = Math.min(1, this.trauma + trauma);
    this.fovKick += fov;
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  damage(amount: number, now: number) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = now;
    this.shake(Math.min(0.6, amount / 40));
    if (this.health <= 0) this.alive = false;
  }

  update(dt: number, input: Input, now: number) {
    this.time += dt;
    const sensBase = 0.0022 * input.sensitivity * (this.ads ? 0.6 : 1);
    this.yaw -= input.mouseDX * sensBase;
    this.pitch -= input.mouseDY * sensBase;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);

    const back = 1 - Math.exp(-dt * 11);
    const dp = this.recoilPitch * back, dyaw = this.recoilYaw * back;
    this.recoilPitch -= dp;
    this.recoilYaw -= dyaw;
    this.pitch += dp * 0.18;
    this.yaw += dyaw * 0.12;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    this.trauma = Math.max(0, this.trauma - dt * 2.1);
    this.fovKick *= Math.exp(-dt * 10);

    if (this.alive && now - this.lastDamageAt > 4 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * 14);
    }
    if (!this.alive || this.frozen) {
      this.vel.set(0, 0, 0);
      return;
    }

    let fx = 0, fz = 0;
    if (input.down("KeyW")) fz += 1;
    if (input.down("KeyS")) fz -= 1;
    if (input.down("KeyD")) fx += 1;
    if (input.down("KeyA")) fx -= 1;
    const moving = fx !== 0 || fz !== 0;
    this.crouching = input.down("KeyC") || input.down("ControlLeft");
    this.sprinting = moving && fz > 0 && input.down("ShiftLeft") && !this.ads && !this.crouching;
    const speed = this.crouching ? CROUCH : this.sprinting ? SPRINT : this.ads ? WALK * 0.6 : WALK;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * fz + cos * fx;
    let wz = -cos * fz - sin * fx;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    const accel = this.onGround ? 14 : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;

    if (this.onGround && input.wasPressed("Space")) {
      this.vel.y = JUMP;
      this.onGround = false;
      this.jumps++;
    }
    this.vel.y -= GRAVITY * dt;

    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    this.collision.resolve(this.pos, RADIUS);

    const ground = this.collision.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const wasGround = this.onGround;
    if (this.pos.y <= ground || (wasGround && this.vel.y <= 0 && this.pos.y - ground < 0.7)) {
      if (!wasGround && this.fallSpeed > 6) this.audio.land(this.fallSpeed / 4);
      if (!wasGround && this.fallSpeed > 8) this.shake(Math.min(0.4, this.fallSpeed / 40));
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
      this.fallSpeed = -this.vel.y;
    }

    const moved = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
    this.distanceMoved += moved;
    if (this.sprinting) this.sprintDistance += moved;
    if (this.onGround && moved > 0.001) {
      this.stepAccum += moved;
      const stride = this.sprinting ? 2.9 : 2.2;
      if (this.stepAccum > stride) {
        this.stepAccum = 0;
        this.audio.footstep(this.sprinting);
      }
      this.bobPhase += moved * (this.sprinting ? 1.9 : 2.4);
    }
    const targetBob = this.onGround ? Math.min(1, Math.hypot(this.vel.x, this.vel.z) / SPRINT) : 0;
    this.bobAmt += (targetBob - this.bobAmt) * (1 - Math.exp(-dt * 10));
    const targetEye = this.crouching ? 1.1 : 1.68;
    this.eye += (targetEye - this.eye) * (1 - Math.exp(-dt * 12));
  }

  get speed01() {
    return Math.min(1, Math.hypot(this.vel.x, this.vel.z) / SPRINT);
  }

  get bob() {
    return { phase: this.bobPhase, amount: this.bobAmt };
  }

  applyCamera(camera: THREE.PerspectiveCamera, baseFov: number, adsFov: number) {
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.06 * this.bobAmt * (this.ads ? 0.3 : 1);
    const bobX = Math.cos(this.bobPhase) * 0.035 * this.bobAmt * (this.ads ? 0.3 : 1);
    const t2 = this.trauma * this.trauma;
    const n = (s: number) => Math.sin(this.time * 37 + s) * 0.6 + Math.sin(this.time * 61 + s * 2.3) * 0.4;
    camera.position.set(this.pos.x, this.pos.y + this.eye + bobY, this.pos.z);
    camera.position.x += Math.cos(this.yaw) * bobX;
    camera.position.z -= Math.sin(this.yaw) * bobX;
    camera.rotation.order = "YXZ";
    camera.rotation.y = this.yaw + this.recoilYaw * 0.65 + n(1) * t2 * 0.05;
    camera.rotation.x = this.pitch + this.recoilPitch * 0.65 + n(7) * t2 * 0.05;
    camera.rotation.z = n(13) * t2 * 0.04 + (this.alive ? 0 : 0.5);
    const targetFov = (this.ads ? adsFov : this.sprinting ? baseFov + 7 : baseFov) + this.fovKick;
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }

  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
  }
}
