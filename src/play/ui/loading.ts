import type { WorldData, WorldProgress, WorldSize } from "../../../shared/types.ts";
import { lookupZip, streamWorld } from "../net/api.ts";
import { escapeHtml } from "./menu.ts";
import { contourInterval, renderTacMap } from "./tacmap.ts";

const STAGES: [string, string][] = [
  ["geocode", "Satellite lock"],
  ["survey", "Survey uplink"],
  ["terrain", "Elevation model"],
  ["osm", "Street survey"],
  ["scatter", "Vegetation"],
  ["director", "AI director"],
  ["assemble", "Battlefield"],
];

const TIPS = [
  "The Anaconda's .44 Magnum punches through up to four goblins in a line. Line them up.",
  "Headshots do 2.5× damage. Goblin heads also pop off. You're welcome.",
  "Parked cars explode. Goblins near parked cars also explode. Science.",
  "Brutes drop Magnum ammo every time. Shamans throw homing fireballs: keep moving.",
  "The 1911 has infinite reserve mags. The Anaconda doesn't. Ration the BOOM.",
  "Kill fast to stack your combo multiplier up to x8.",
  "Every building, road and hill you're about to see is really there.",
  "Sgt. Grimsby has never once been impressed. Don't take it personally.",
];

export class Loading {
  readonly el: HTMLElement;
  private shown = 0;
  private target = 0;
  private raf = 0;
  private tipTimer = 0;
  private cancel: (() => void) | null = null;
  private stageIdx = -1;

  constructor(parent: HTMLElement, private readonly zip: string, private readonly size: WorldSize) {
    this.el = document.createElement("section");
    this.el.className = "loading fade-in";
    this.el.innerHTML = `
      <div class="ld-floor"></div>
      <div class="ld-radar"><div class="sweep"></div>
        <div class="blip" style="left:62%;top:30%"></div><div class="blip" style="left:28%;top:64%;animation-delay:.7s"></div><div class="blip" style="left:70%;top:72%;animation-delay:1.4s"></div>
      </div>
      <div class="grain"></div>
      <div class="ld-center">
        <div class="ld-zip">${zip.split("").join(" ")}</div>
        <h2 class="ld-place glitch" data-text="ACQUIRING">ACQUIRING</h2>
        <div class="ld-coords">&nbsp;</div>
        <div class="ld-percent"><span class="num">0</span><small>%</small></div>
        <div class="ld-bar"><i></i></div>
        <ul class="ld-stages">${STAGES.map(([id, label]) => `<li data-stage="${id}"><b></b>${label}</li>`).join("")}</ul>
        <div class="ld-detail">&nbsp;</div>
      </div>
      <pre class="ld-log"></pre>
      <div class="ld-tip"><b>FIELD NOTE</b><span></span></div>
    `;
    parent.appendChild(this.el);
    this.rotateTip();
    this.tipTimer = window.setInterval(() => this.rotateTip(), 4500);
    this.raf = requestAnimationFrame(this.tick);

    void lookupZip(zip).then((p) => {
      if (!p) return;
      this.setPlace(`${p.name}, ${p.stateAbbr}`, `${p.lat.toFixed(4)}° N  ${Math.abs(p.lon).toFixed(4)}° W`);
    });
  }

  private setPlace(name: string, coords: string) {
    const h = this.el.querySelector<HTMLElement>(".ld-place")!;
    h.textContent = name;
    h.dataset.text = name;
    this.el.querySelector(".ld-coords")!.textContent = coords;
  }

  private rotateTip() {
    this.el.querySelector(".ld-tip span")!.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    this.shown += (this.target - this.shown) * 0.12;
    const pct = Math.min(100, Math.round(this.shown * 100));
    this.el.querySelector(".ld-percent .num")!.textContent = String(pct);
    this.el.querySelector<HTMLElement>(".ld-bar i")!.style.width = `${this.shown * 100}%`;
  };

  private log(msg: string) {
    const pre = this.el.querySelector(".ld-log")!;
    const span = document.createElement("span");
    span.textContent = msg;
    pre.appendChild(span);
    while (pre.childElementCount > 14) pre.firstElementChild?.remove();
  }

  private onProgress(p: WorldProgress) {
    if (p.type === "log") {
      this.log(p.message);
      const m = /Target acquired: (.+) @ ([-\d.]+), ([-\d.]+)/.exec(p.message);
      if (m) this.setPlace(m[1], `${Number(m[2]).toFixed(4)}° N  ${Math.abs(Number(m[3])).toFixed(4)}° W`);
    } else if (p.type === "stage") {
      this.target = Math.max(this.target, p.progress);
      this.el.querySelector(".ld-detail")!.textContent = p.detail ? `${p.label} · ${p.detail}` : p.label;
      const idx = STAGES.findIndex(([id]) => id === p.stage);
      if (p.stage === "cache") {
        this.el.querySelectorAll(".ld-stages li").forEach((li) => li.classList.add("done"));
      } else if (idx >= 0) {
        this.stageIdx = Math.max(this.stageIdx, idx);
        this.el.querySelectorAll(".ld-stages li").forEach((li, i) => {
          li.classList.toggle("done", i < this.stageIdx || (i === this.stageIdx && ["terrain", "osm"].includes(STAGES[i][0])));
          li.classList.toggle("active", i === this.stageIdx && !li.classList.contains("done"));
        });
      }
    }
  }

  async run(): Promise<WorldData> {
    const { promise, cancel } = streamWorld(this.zip, this.size, (p) => this.onProgress(p));
    this.cancel = cancel;
    const world = await promise;
    this.target = 1;
    this.el.querySelectorAll(".ld-stages li").forEach((li) => {
      li.classList.remove("active");
      li.classList.add("done");
    });
    await new Promise((r) => setTimeout(r, 700));
    return world;
  }

  showError(message: string, onRetry: () => void, onBack: () => void) {
    const c = this.el.querySelector(".ld-center")!;
    const box = document.createElement("div");
    box.className = "ld-error";
    box.innerHTML = `<div>${escapeHtml(message)}</div><div style="display:flex;gap:10px;justify-content:center"><button class="btn-ghost retry">RETRY</button><button class="btn-ghost back">NEW ZIP</button></div>`;
    c.appendChild(box);
    box.querySelector(".retry")!.addEventListener("click", onRetry);
    box.querySelector(".back")!.addEventListener("click", onBack);
  }

  destroy() {
    this.cancel?.();
    cancelAnimationFrame(this.raf);
    clearInterval(this.tipTimer);
    this.el.remove();
  }
}

export class Briefing {
  readonly el: HTMLElement;

  constructor(parent: HTMLElement, world: WorldData, onGo: () => void) {
    const d = world.director;
    const w = world.weather;
    this.el = document.createElement("section");
    this.el.className = "briefing";
    const stats: [number, string, number][] = [
      [world.stats.buildings, "STRUCTURES", 0],
      [world.stats.roadKm, "KM OF ROAD", 1],
      [Math.round(world.stats.reliefMeters), "M RELIEF", 0],
      [world.stats.trees, "TREES", 0],
      [Math.round(world.terrain.maxElevation), "M PEAK ELEV", 0],
      [d.waves, "WAVES", 0],
    ];
    this.el.innerHTML = `
      <div class="brief-card panel">
        <div class="brief-left">
          <div class="map-label">TACTICAL SURVEY · ${world.sizeMeters}M²</div>
          <div class="map-scale">CONTOURS ${contourInterval(world)} M · ▲ YOU · ⊗ GOBLIN WARRENS</div>
        </div>
        <div class="brief-right">
          <div class="eyebrow">Classified · AI director: ${d.source === "openai" ? "OpenAI" : "rules engine"}</div>
          <h2 class="codename">${escapeHtml(d.codename)}</h2>
          <div class="brief-place">${escapeHtml(world.place.name.toUpperCase())}, ${world.place.stateAbbr} ${world.place.zip} · ${escapeHtml(d.biome.toUpperCase())}</div>
          <p class="brief-text">${escapeHtml(d.briefing)}</p>
          <div class="brief-stats">${stats.map(([v, l, dec]) => `<div class="stat"><b data-v="${v}" data-d="${dec}">0</b><span>${l}</span></div>`).join("")}</div>
          <div class="brief-src">LIVE WX: ${escapeHtml(w.description.toUpperCase())} · ${Math.round(w.temperatureC)}°C · WIND ${Math.round(w.windKph)} KM/H<br/>
            DEM: ${escapeHtml(world.terrain.source)} · ${world.terrain.resolution}² SAMPLES @ ${world.terrain.metersPerSample.toFixed(1)} M${world.cached ? " · SERVED FROM SHARD CACHE" : ""}</div>
          <button class="btn-deploy brief-go"><span>CLICK TO DROP IN</span><i class="shine"></i></button>
        </div>
      </div>
    `;
    parent.appendChild(this.el);
    const map = renderTacMap(world, 720, "brief");
    map.className = "tac-map";
    this.el.querySelector(".brief-left")!.prepend(map);

    const t0 = performance.now();
    const els = [...this.el.querySelectorAll<HTMLElement>(".brief-stats b")];
    const count = () => {
      const k = Math.min(1, (performance.now() - t0) / 1400);
      const e = 1 - Math.pow(1 - k, 3);
      for (const el of els) {
        const v = Number(el.dataset.v) * e;
        el.textContent = Number(el.dataset.d) ? v.toFixed(1) : Math.round(v).toLocaleString();
      }
      if (k < 1) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    this.el.querySelector(".brief-go")!.addEventListener("click", onGo);
  }

  destroy() {
    this.el.remove();
  }
}
