import type { Input } from "../engine/input.ts";

type Stick = {
  id: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
};

const LOOK_SCALE = 1.35;
const STICK_RADIUS = 54;

export class TouchControls {
  readonly el: HTMLDivElement;
  private stickEl: HTMLElement;
  private knobEl: HTMLElement;
  private lookEl: HTMLElement;
  private fireBtn: HTMLElement;
  private adsBtn: HTMLElement;
  private stick: Stick | null = null;
  private lookId = -1;
  private lookLastX = 0;
  private lookLastY = 0;
  private visible = false;

  constructor(
    parent: HTMLElement,
    private readonly input: Input,
    private readonly onPause: () => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "touch-pad hidden";
    this.el.innerHTML = `
      <div class="touch-stick" aria-hidden="true">
        <i class="touch-stick-ring"></i>
        <i class="touch-stick-knob"></i>
      </div>
      <div class="touch-look" aria-hidden="true"></div>
      <div class="touch-actions">
        <button type="button" class="touch-btn touch-swap" data-act="swap">SWAP</button>
        <button type="button" class="touch-btn touch-reload" data-act="reload">RELOAD</button>
        <button type="button" class="touch-btn touch-jump" data-act="jump">JUMP</button>
        <button type="button" class="touch-btn touch-ads" data-act="ads">AIM</button>
        <button type="button" class="touch-btn touch-fire" data-act="fire">FIRE</button>
      </div>
      <button type="button" class="touch-btn touch-pause" data-act="pause">II</button>
    `;
    parent.appendChild(this.el);
    this.stickEl = this.el.querySelector(".touch-stick")!;
    this.knobEl = this.el.querySelector(".touch-stick-knob")!;
    this.lookEl = this.el.querySelector(".touch-look")!;
    this.fireBtn = this.el.querySelector(".touch-fire")!;
    this.adsBtn = this.el.querySelector(".touch-ads")!;

    this.bindStick();
    this.bindLook();
    this.bindButtons();
  }

  show(v: boolean) {
    this.visible = v;
    this.el.classList.toggle("hidden", !v);
    if (!v) this.reset();
  }

  destroy() {
    this.reset();
    this.el.remove();
  }

  private reset() {
    this.stick = null;
    this.lookId = -1;
    this.input.setMove(0, 0);
    this.input.hold("ShiftLeft", false);
    this.input.fireHeld = false;
    this.input.adsHeld = false;
    this.knobEl.style.transform = "translate(-50%, -50%)";
    this.stickEl.classList.remove("active");
    this.fireBtn.classList.remove("held");
    this.adsBtn.classList.remove("held");
  }

  private bindStick() {
    const zone = this.stickEl;
    zone.addEventListener("pointerdown", (e) => {
      if (!this.visible || !this.input.locked || this.stick) return;
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      this.stick = { id: e.pointerId, originX: cx, originY: cy, x: e.clientX, y: e.clientY };
      zone.classList.add("active");
      this.applyStick(e.clientX, e.clientY);
    });
    zone.addEventListener("pointermove", (e) => {
      if (!this.stick || e.pointerId !== this.stick.id) return;
      e.preventDefault();
      this.applyStick(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (!this.stick || e.pointerId !== this.stick.id) return;
      this.stick = null;
      this.input.setMove(0, 0);
      this.input.hold("ShiftLeft", false);
      this.knobEl.style.transform = "translate(-50%, -50%)";
      zone.classList.remove("active");
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
  }

  private applyStick(x: number, y: number) {
    if (!this.stick) return;
    let dx = x - this.stick.originX;
    let dy = y - this.stick.originY;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / STICK_RADIUS;
    const nz = -dy / STICK_RADIUS;
    this.input.setMove(nx, nz);
    // Auto-sprint when the stick is pushed hard forward.
    this.input.hold("ShiftLeft", nz > 0.72 && Math.hypot(nx, nz) > 0.78);
  }

  private bindLook() {
    const zone = this.lookEl;
    zone.addEventListener("pointerdown", (e) => {
      if (!this.visible || !this.input.locked || this.lookId >= 0) return;
      if ((e.target as HTMLElement).closest(".touch-btn")) return;
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      this.lookId = e.pointerId;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.lookId) return;
      e.preventDefault();
      const dx = e.clientX - this.lookLastX;
      const dy = e.clientY - this.lookLastY;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
      this.input.look(dx * LOOK_SCALE, dy * LOOK_SCALE);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.lookId) return;
      this.lookId = -1;
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
  }

  private bindButtons() {
    const fire = (down: boolean) => {
      if (!this.input.locked) return;
      if (down && !this.input.fireHeld) this.input.firePressed = true;
      this.input.fireHeld = down;
      this.fireBtn.classList.toggle("held", down);
    };

    this.fireBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.fireBtn.setPointerCapture(e.pointerId);
      fire(true);
    });
    this.fireBtn.addEventListener("pointerup", () => fire(false));
    this.fireBtn.addEventListener("pointercancel", () => fire(false));

    this.adsBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!this.input.locked) return;
      this.input.adsHeld = !this.input.adsHeld;
      this.adsBtn.classList.toggle("held", this.input.adsHeld);
    });

    this.el.querySelectorAll<HTMLElement>("[data-act]").forEach((btn) => {
      const act = btn.dataset.act!;
      if (act === "fire" || act === "ads") return;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (act === "pause") {
          this.onPause();
          return;
        }
        if (!this.input.locked) return;
        if (act === "jump") this.input.tap("Space");
        if (act === "reload") this.input.tap("KeyR");
        if (act === "swap") this.input.tap("KeyQ");
        btn.classList.add("pulse");
        setTimeout(() => btn.classList.remove("pulse"), 120);
      });
    });
  }
}
