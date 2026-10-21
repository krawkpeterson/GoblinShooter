export function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  // Coarse pointer = phone/tablet. Avoid maxTouchPoints so hybrid laptops keep mouse+lock.
  return matchMedia("(pointer: coarse)").matches;
}

export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  /** Analog move axes for touch (-1..1). Combined with WASD. */
  moveX = 0;
  moveZ = 0;
  fireHeld = false;
  firePressed = false;
  adsHeld = false;
  /** Rising edge on RMB / AIM — used for LPVO zoom cycling. */
  adsPressed = false;
  wheel = 0;
  locked = false;
  readonly touch = detectTouch();
  sensitivity = Number(localStorage.getItem("krawk.sens") ?? 1);
  onLockChange?: (locked: boolean) => void;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.locked && ["Space", "Tab", "KeyQ"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    document.addEventListener("mousemove", (e) => {
      if (!this.locked || this.touch) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener("mousedown", (e) => {
      if (!this.locked || this.touch) return;
      if (e.button === 0) {
        this.fireHeld = true;
        this.firePressed = true;
      }
      if (e.button === 2) {
        this.adsHeld = true;
        this.adsPressed = true;
      }
    });
    document.addEventListener("mouseup", (e) => {
      if (this.touch) return;
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.adsHeld = false;
    });
    document.addEventListener("wheel", (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    });
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("pointerlockchange", () => {
      if (this.touch) return;
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) {
        this.fireHeld = this.adsHeld = false;
        this.keys.clear();
      }
      this.onLockChange?.(this.locked);
    });

    if (this.touch) {
      document.documentElement.classList.add("touch");
      // Stop rubber-band scroll / pinch while playing.
      document.addEventListener(
        "touchmove",
        (e) => {
          if (this.locked) e.preventDefault();
        },
        { passive: false },
      );
    }
  }

  lock() {
    if (this.touch) {
      if (this.locked) return;
      this.locked = true;
      this.onLockChange?.(true);
      return;
    }
    const req = this.target.requestPointerLock({ unadjustedMovement: true }) as unknown as Promise<void> | undefined;
    req?.catch?.(() => this.target.requestPointerLock());
  }

  unlock() {
    if (this.touch) {
      if (!this.locked) return;
      this.locked = false;
      this.clearCombat();
      this.onLockChange?.(false);
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private clearCombat() {
    this.fireHeld = this.adsHeld = false;
    this.keys.clear();
    this.moveX = this.moveZ = 0;
  }

  setSensitivity(v: number) {
    this.sensitivity = v;
    localStorage.setItem("krawk.sens", String(v));
  }

  /** Hold a synthetic key (touch buttons / joystick). */
  hold(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** One-shot press for jump / reload / swap. */
  tap(code: string) {
    this.keys.add(code);
    this.pressed.add(code);
  }

  look(dx: number, dy: number) {
    if (!this.locked) return;
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  setMove(x: number, z: number) {
    this.moveX = x;
    this.moveZ = z;
  }

  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  down(code: string) {
    return this.keys.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.firePressed = false;
    this.adsPressed = false;
    this.wheel = 0;
  }
}
