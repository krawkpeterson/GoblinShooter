import { WORLD_SIZES, type WorldSize } from "../../../shared/types.ts";
import type { AudioEngine } from "../audio/audio.ts";
import { fetchHealth, fetchLeaderboard, lookupZip } from "../net/api.ts";
import type { LoadoutId } from "../weapons/weapons.ts";
import { ContourFlyover } from "./menuBackground.ts";

export type GameMode = "waves" | "survival";

export interface DeployRequest {
  zip: string;
  size: WorldSize;
  callsign: string;
  lighting: Lighting;
  loadout: LoadoutId;
  mode: GameMode;
}

export type Lighting = "live" | "noon" | "golden" | "night";

export const LIGHTING_HOURS: Record<Exclude<Lighting, "live">, number> = { noon: 13, golden: 17.4, night: 22.5 };

const LIGHTINGS: [Lighting, string][] = [["live", "LIVE"], ["noon", "NOON"], ["golden", "GOLDEN"], ["night", "NIGHT"]];

const QUICK = [
  ["95993", "Yuba City"],
  ["90210", "Beverly Hills"],
  ["10001", "Manhattan"],
  ["94133", "San Francisco"],
  ["81435", "Telluride"],
  ["86023", "Grand Canyon"],
  ["33139", "Miami Beach"],
];

const SIZES: Record<WorldSize, [string, string]> = {
  600: ["SKIRMISH", "600 m · fast"],
  1000: ["WARZONE", "1 km · default"],
  1600: ["APOCALYPSE", "1.6 km · huge"],
};

export class Menu {
  readonly el: HTMLElement;
  private bg: ContourFlyover;
  private size: WorldSize = 1000;
  private lighting: Lighting = "live";
  private loadout: LoadoutId = 0;
  private mode: GameMode = "waves";
  private validZip: string | null = null;
  private lookupSeq = 0;

  constructor(parent: HTMLElement, private readonly audio: AudioEngine, onDeploy: (r: DeployRequest) => void) {
    this.el = document.createElement("section");
    this.el.className = "menu";
    const savedSize = Number(localStorage.getItem("krawk.size"));
    if ((WORLD_SIZES as readonly number[]).includes(savedSize)) this.size = savedSize as WorldSize;
    const params = new URLSearchParams(location.search);
    const savedLight = (params.get("tod") ?? localStorage.getItem("krawk.lighting")) as Lighting | null;
    if (savedLight && LIGHTINGS.some(([k]) => k === savedLight)) this.lighting = savedLight;
    const savedLoad = Number(localStorage.getItem("krawk.loadout"));
    if (savedLoad === 0 || savedLoad === 1 || savedLoad === 2) this.loadout = savedLoad as LoadoutId;
    const savedMode = localStorage.getItem("krawk.mode") as GameMode | null;
    if (savedMode === "waves" || savedMode === "survival") this.mode = savedMode;

    this.el.innerHTML = `
      <canvas class="menu-bg"></canvas>
      <div class="menu-vignette"></div>
      <div class="menu-scan"></div>
      <div class="grain"></div>
      <header class="menu-top">
        <a class="brand-mini" href="./"><img src="favicon.svg" alt="" />KRAWK</a>
        <div class="menu-status"><span class="dot"></span><span class="status-text">CONNECTING TO COMMAND…</span></div>
      </header>
      <div class="menu-main">
        <div class="menu-left">
          <div class="eyebrow">Real-world terrain combat</div>
          <h1 class="title glitch" data-text="KRAWK">KRAWK</h1>
          <p class="tagline">Type any US zip code. We pull the <b>real elevation, streets and buildings</b>, an AI director builds the battle, and goblins pour in. Three loadouts. Two modes: clear waves — or survive the endless swarm.</p>
          <form class="deploy-form" autocomplete="off">
            <label class="field-label">TARGET ZIP CODE</label>
            <div class="zip-cells">${'<input class="zip-cell" maxlength="1" inputmode="numeric" placeholder="0" />'.repeat(5)}</div>
            <div class="zip-preview"><span class="zip-pin"></span><span class="zip-place">Awaiting coordinates</span><span class="zip-coords"></span></div>
            <div class="quick-zips">${QUICK.map(([z, n]) => `<button type="button" class="chip" data-zip="${z}"><b>${z}</b>${n}</button>`).join("")}</div>
            <label class="field-label">MISSION MODE</label>
            <div class="seg">
              <button type="button" class="seg-btn mode-btn${this.mode === "waves" ? " on" : ""}" data-mode="waves"><b>WAVES</b><small>Clear the zip · boss finale</small></button>
              <button type="button" class="seg-btn mode-btn${this.mode === "survival" ? " on" : ""}" data-mode="survival"><b>SURVIVAL</b><small>Endless pressure · last as long as you can</small></button>
            </div>
            <label class="field-label">BATTLEFIELD SIZE</label>
            <div class="seg">${WORLD_SIZES.map((s) => `<button type="button" class="seg-btn${s === this.size ? " on" : ""}" data-size="${s}"><b>${SIZES[s][0]}</b><small>${SIZES[s][1]}</small></button>`).join("")}</div>
            <label class="field-label">LIGHTING <em class="field-hint">LIVE = real local sun position right now</em></label>
            <div class="seg seg-4">${LIGHTINGS.map(([k, n]) => `<button type="button" class="seg-btn light-btn${k === this.lighting ? " on" : ""}" data-light="${k}"><b>${n}</b></button>`).join("")}</div>
            <label class="field-label">CALLSIGN</label>
            <input class="callsign" maxlength="24" placeholder="MAGGOT" value="${(localStorage.getItem("krawk.callsign") ?? "").replace(/"/g, "")}" />
            <div class="menu-actions">
              <button class="btn-deploy" type="submit" disabled><span>DEPLOY</span><i class="shine"></i></button>
            </div>
          </form>
        </div>
        <aside class="menu-right">
          <div class="panel loadout">
            <h3><span>LOADOUT</span><span class="load-n">ALPHA</span></h3>
            <div class="seg load-seg">
              <button type="button" class="seg-btn load-btn on" data-load="0"><b>ALPHA</b><small>1911 · ANACONDA</small></button>
              <button type="button" class="seg-btn load-btn" data-load="1"><b>BRAVO</b><small>REDHAWK · MODEL 12</small></button>
              <button type="button" class="seg-btn load-btn" data-load="2"><b>CHARLIE</b><small>PRECISION · M60</small></button>
            </div>
            <div class="load-set" data-set="0">
              <div class="gun-card"><div><b>M1911 DOUBLE-STACK</b><span>.45 ACP · 14+1 · SEMI</span></div>
                <div class="bars"><div class="bar"><i style="width:55%"></i></div><div class="bar"><i style="width:88%"></i></div><div class="bar"><i style="width:80%"></i></div></div></div>
              <div class="gun-card mag"><div><b>COLT ANACONDA</b><span>.44 MAGNUM · 6 RDS · PENETRATES</span></div>
                <div class="bars"><div class="bar"><i style="width:100%"></i></div><div class="bar"><i style="width:30%"></i></div><div class="bar"><i style="width:95%"></i></div></div></div>
            </div>
            <div class="load-set" data-set="1" hidden>
              <div class="gun-card"><div><b>RUGER REDHAWK</b><span>.44 MAGNUM · 6 RDS · DA/SA</span></div>
                <div class="bars"><div class="bar"><i style="width:72%"></i></div><div class="bar"><i style="width:38%"></i></div><div class="bar"><i style="width:70%"></i></div></div></div>
              <div class="gun-card mag"><div><b>WINCHESTER MODEL 12</b><span>12 GAUGE · 6+1 PUMP · BUCKSHOT</span></div>
                <div class="bars"><div class="bar"><i style="width:88%"></i></div><div class="bar"><i style="width:44%"></i></div><div class="bar"><i style="width:55%"></i></div></div></div>
            </div>
            <div class="load-set" data-set="2" hidden>
              <div class="gun-card"><div><b>RUGER PRECISION</b><span>6.5 CM · BOLT · SCOPE</span></div>
                <div class="bars"><div class="bar"><i style="width:100%"></i></div><div class="bar"><i style="width:28%"></i></div><div class="bar"><i style="width:98%"></i></div></div></div>
              <div class="gun-card mag"><div><b>M60 MACHINE GUN</b><span>7.62 NATO · 100 RD · FULL AUTO</span></div>
                <div class="bars"><div class="bar"><i style="width:70%"></i></div><div class="bar"><i style="width:55%"></i></div><div class="bar"><i style="width:40%"></i></div></div></div>
            </div>
          </div>
          <div class="panel board"><h3><span>GLOBAL KILLBOARD</span><span class="board-shards"></span></h3><ol class="board-list"><li class="board-empty">Loading…</li></ol></div>
        </aside>
      </div>
      <footer class="menu-foot">
        <span>TERRAIN: AWS TERRARIUM DEM · MAP DATA © OPENSTREETMAP CONTRIBUTORS · WEATHER: OPEN-METEO</span>
        <span>KRAWK v0.1</span>
      </footer>
    `;
    parent.appendChild(this.el);
    this.bg = new ContourFlyover(this.el.querySelector(".menu-bg")!);
    this.syncLoadout();

    const cells = [...this.el.querySelectorAll<HTMLInputElement>(".zip-cell")];
    const form = this.el.querySelector<HTMLFormElement>(".deploy-form")!;
    const deployBtn = this.el.querySelector<HTMLButtonElement>(".btn-deploy")!;
    const callsign = this.el.querySelector<HTMLInputElement>(".callsign")!;

    const setZip = (zip: string) => {
      cells.forEach((c, i) => {
        c.value = zip[i] ?? "";
        c.classList.toggle("filled", !!c.value);
      });
      this.onZipChange(cells, deployBtn);
    };

    cells.forEach((cell, i) => {
      cell.addEventListener("input", () => {
        cell.value = cell.value.replace(/\D/g, "").slice(-1);
        cell.classList.toggle("filled", !!cell.value);
        if (cell.value) {
          this.audio.uiTick();
          cells[i + 1]?.focus();
        }
        this.onZipChange(cells, deployBtn);
      });
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !cell.value && i > 0) {
          cells[i - 1].value = "";
          cells[i - 1].classList.remove("filled");
          cells[i - 1].focus();
          this.onZipChange(cells, deployBtn);
        }
        if (e.key === "ArrowLeft") cells[i - 1]?.focus();
        if (e.key === "ArrowRight") cells[i + 1]?.focus();
      });
      cell.addEventListener("paste", (e) => {
        const text = e.clipboardData?.getData("text").replace(/\D/g, "").slice(0, 5) ?? "";
        if (text.length) {
          e.preventDefault();
          setZip(text);
          cells[Math.min(4, text.length)]?.focus();
        }
      });
      cell.addEventListener("focus", () => cell.select());
    });

    this.el.querySelectorAll<HTMLButtonElement>(".chip").forEach((b) =>
      b.addEventListener("click", () => {
        this.audio.unlock();
        this.audio.uiTick();
        setZip(b.dataset.zip!);
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>(".light-btn").forEach((b) =>
      b.addEventListener("click", () => {
        this.audio.unlock();
        this.audio.uiTick();
        this.lighting = b.dataset.light as Lighting;
        localStorage.setItem("krawk.lighting", this.lighting);
        this.el.querySelectorAll(".light-btn").forEach((x) => x.classList.toggle("on", x === b));
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>(".load-btn").forEach((b) =>
      b.addEventListener("click", () => {
        this.audio.unlock();
        this.audio.uiTick();
        this.loadout = Number(b.dataset.load) as LoadoutId;
        localStorage.setItem("krawk.loadout", String(this.loadout));
        this.syncLoadout();
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((b) =>
      b.addEventListener("click", () => {
        this.audio.unlock();
        this.audio.uiTick();
        this.mode = b.dataset.mode as GameMode;
        localStorage.setItem("krawk.mode", this.mode);
        this.el.querySelectorAll(".mode-btn").forEach((x) => x.classList.toggle("on", x === b));
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>(".seg-btn[data-size]").forEach((b) =>
      b.addEventListener("click", () => {
        this.audio.unlock();
        this.audio.uiTick();
        this.size = Number(b.dataset.size) as WorldSize;
        localStorage.setItem("krawk.size", String(this.size));
        this.el.querySelectorAll(".seg-btn[data-size]").forEach((x) => x.classList.toggle("on", x === b));
      }),
    );

    const go = () => {
      this.audio.unlock();
      if (!this.validZip) {
        const wrap = this.el.querySelector(".zip-cells")!;
        wrap.classList.remove("shake");
        void (wrap as HTMLElement).offsetWidth;
        wrap.classList.add("shake");
        this.audio.dryFire();
        cells.find((c) => !c.value)?.focus();
        return;
      }
      const name = callsign.value.trim().toUpperCase() || "MAGGOT";
      localStorage.setItem("krawk.callsign", name);
      this.audio.uiDeploy();
      this.bg.boost = 1;
      onDeploy({ zip: this.validZip, size: this.size, callsign: name, lighting: this.lighting, loadout: this.loadout, mode: this.mode });
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      go();
    });
    this.el.addEventListener("pointerdown", () => this.audio.unlock(), { once: true });

    const preset = params.get("zip");
    if (preset && /^\d{5}$/.test(preset)) setZip(preset);
    else setTimeout(() => cells[0].focus(), 600);

    void this.loadSideData();
  }

  private syncLoadout() {
    this.el.querySelectorAll(".load-btn").forEach((x) => x.classList.toggle("on", Number((x as HTMLElement).dataset.load) === this.loadout));
    this.el.querySelectorAll<HTMLElement>(".load-set").forEach((el) => {
      el.hidden = Number(el.dataset.set) !== this.loadout;
    });
    const n = this.el.querySelector(".load-n");
    if (n) n.textContent = this.loadout === 0 ? "ALPHA" : this.loadout === 1 ? "BRAVO" : "CHARLIE";
  }

  private async onZipChange(cells: HTMLInputElement[], deployBtn: HTMLButtonElement) {
    const zip = cells.map((c) => c.value).join("");
    const preview = this.el.querySelector(".zip-preview")!;
    const place = this.el.querySelector(".zip-place")!;
    const coords = this.el.querySelector(".zip-coords")!;
    this.validZip = null;
    deployBtn.disabled = true;
    preview.classList.remove("ok", "bad");
    if (zip.length < 5) {
      place.textContent = zip.length ? `Locking… ${zip.padEnd(5, "·")}` : "Awaiting coordinates";
      coords.textContent = "";
      return;
    }
    const seq = ++this.lookupSeq;
    place.textContent = "Triangulating…";
    const p = await lookupZip(zip);
    if (seq !== this.lookupSeq) return;
    if (!p) {
      preview.classList.add("bad");
      place.textContent = `${zip} didn't lock. Satellite blinked — try it again.`;
      coords.textContent = "";
      return;
    }
    preview.classList.add("ok");
    place.textContent = `${p.name.toUpperCase()}, ${p.stateAbbr}`;
    coords.textContent = `${p.lat.toFixed(4)}°, ${p.lon.toFixed(4)}°`;
    this.validZip = zip;
    deployBtn.disabled = false;
  }

  private async loadSideData() {
    const [health, board] = await Promise.all([fetchHealth(), fetchLeaderboard()]);
    const status = this.el.querySelector(".status-text")!;
    status.textContent = health
      ? `${health.local ? "BROWSER MODE · LOCAL KILLBOARD" : `${health.shards.length} DB SHARDS ONLINE`} · AI DIRECTOR: ${health.ai === "openai" ? "OPENAI" : "RULES ENGINE"}`
      : "COMMAND OFFLINE · START THE API SERVER";
    this.el.querySelector(".board-shards")!.textContent = health ? (health.local ? "THIS DEVICE" : `${health.shards.length} SHARDS`) : "";
    const list = this.el.querySelector(".board-list")!;
    list.innerHTML = board.length
      ? board
          .slice(0, 10)
          .map(
            (e, i) =>
              `<li><span class="rk">${String(i + 1).padStart(2, "0")}</span><span class="nm">${escapeHtml(e.playerName)}<small>${escapeHtml(e.placeName || e.zip)} · W${e.wave}</small></span><span class="sc">${e.score.toLocaleString()}</span></li>`,
          )
          .join("")
      : `<li class="board-empty">No kills logged yet. Be the first name on the wall.</li>`;
  }

  destroy() {
    this.bg.dispose();
    this.el.remove();
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
