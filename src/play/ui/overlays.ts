import type { LeaderboardEntry, WorldData } from "../../../shared/types.ts";
import type { AudioEngine } from "../audio/audio.ts";
import type { Input } from "../engine/input.ts";
import type { RunStats } from "../game/game.ts";
import { escapeHtml } from "./menu.ts";

export class PauseOverlay {
  readonly el: HTMLElement;

  constructor(parent: HTMLElement, input: Input, audio: AudioEngine, onResume: () => void, onQuit: () => void) {
    this.el = document.createElement("div");
    this.el.className = "overlay";
    this.el.innerHTML = `
      <div class="overlay-card panel">
        <h2>PAUSED</h2>
        <div class="sub">THE GOBLINS ARE WAITING. PATIENTLY. HUNGRILY.</div>
        <div class="slider-row"><label>SENSITIVITY</label><input type="range" class="sens" min="0.2" max="3" step="0.05" value="${input.sensitivity}" /><output class="sens-o">${input.sensitivity.toFixed(2)}</output></div>
        <div class="slider-row"><label>VOLUME</label><input type="range" class="vol" min="0" max="1" step="0.01" value="${audio.volume}" /><output class="vol-o">${Math.round(audio.volume * 100)}</output></div>
        <div class="keys">
          ${input.touch
            ? `<div><kbd>LEFT STICK</kbd>Move · push hard to sprint</div>
          <div><kbd>RIGHT DRAG</kbd>Look</div>
          <div><kbd>FIRE</kbd>Shoot</div><div><kbd>AIM</kbd>Toggle sights</div>
          <div><kbd>JUMP</kbd>Jump</div><div><kbd>RELOAD / SWAP</kbd>Mag &amp; gun</div>`
            : `<div><kbd>WASD</kbd>Move</div><div><kbd>SHIFT</kbd>Sprint</div>
          <div><kbd>SPACE</kbd>Jump</div><div><kbd>C</kbd>Crouch</div>
          <div><kbd>LMB</kbd>Fire</div><div><kbd>RMB</kbd>Aim down sights</div>
          <div><kbd>R</kbd>Reload</div><div><kbd>1 2 3 Q</kbd>Swap weapon</div>`}
        </div>
        <div class="actions">
          <button class="btn-deploy resume"><span>RESUME</span><i class="shine"></i></button>
          <button class="btn-ghost quit">ABANDON ZIP CODE</button>
        </div>
      </div>`;
    parent.appendChild(this.el);
    const sens = this.el.querySelector<HTMLInputElement>(".sens")!;
    sens.addEventListener("input", () => {
      input.setSensitivity(Number(sens.value));
      this.el.querySelector(".sens-o")!.textContent = Number(sens.value).toFixed(2);
    });
    const vol = this.el.querySelector<HTMLInputElement>(".vol")!;
    vol.addEventListener("input", () => {
      audio.setVolume(Number(vol.value));
      this.el.querySelector(".vol-o")!.textContent = String(Math.round(Number(vol.value) * 100));
    });
    this.el.querySelector(".resume")!.addEventListener("click", onResume);
    this.el.querySelector(".quit")!.addEventListener("click", onQuit);
  }

  destroy() {
    this.el.remove();
  }
}

export class EndOverlay {
  readonly el: HTMLElement;

  constructor(
    parent: HTMLElement,
    victory: boolean,
    stats: RunStats,
    world: WorldData,
    submit: Promise<{ entry: LeaderboardEntry; rank: number | null; board: LeaderboardEntry[] } | null>,
    onRetry: () => void,
    onMenu: () => void,
  ) {
    const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const mins = Math.floor(stats.durationSec / 60), secs = Math.round(stats.durationSec % 60);
    const survival = stats.mode === "survival";
    const roast = victory
      ? "Sgt. Grimsby grudgingly admits you didn't completely embarrass the corps."
      : survival && stats.durationSec >= 120
        ? `You held ${world.place.name} for ${mins}m ${secs}s. The swarm still wants more.`
      : stats.kills === 0
        ? "Zero kills. The goblins are leaving you a five-star Yelp review: \"Delicious. Didn't fight back.\""
        : stats.kills < 5
          ? `${stats.kills} kill${stats.kills === 1 ? "" : "s"}? The goblins are writing a Yelp review about how easy you were.`
          : "You died with your boots on. Ugly boots. But on.";
    this.el = document.createElement("div");
    this.el.className = `overlay ${victory ? "end-win" : "end-dead"}`;
    this.el.innerHTML = `
      <div class="overlay-card panel">
        <h2>${victory ? "ZIP CODE LIBERATED" : survival ? "SURVIVAL ENDED" : "YOU GOT GOBLINED"}</h2>
        <div class="sub">${escapeHtml(world.place.name.toUpperCase())}, ${world.place.stateAbbr} ${world.place.zip} · ${escapeHtml(world.director.codename)}${survival ? " · SURVIVAL" : ""}</div>
        <div class="end-stats">
          <div><b>${stats.score.toLocaleString()}</b><span>SCORE</span></div>
          <div><b>${stats.kills}</b><span>GOBLINS KILLED</span></div>
          <div><b>${stats.headshots}</b><span>HEADSHOTS</span></div>
          <div><b>${acc}%</b><span>ACCURACY</span></div>
          <div><b>${survival ? `${mins}:${String(secs).padStart(2, "0")}` : `${stats.wave}/${world.director.waves}`}</b><span>${survival ? "SURVIVED" : "WAVE"}</span></div>
          <div><b>${mins}:${String(secs).padStart(2, "0")}</b><span>TIME</span></div>
        </div>
        <p style="color:#b9c4ce;font-size:15px">${roast}</p>
        <div class="end-rank">Uploading to sharded killboard…</div>
        <ol class="end-board"></ol>
        <div class="actions">
          <button class="btn-deploy retry"><span>RUN IT BACK</span><i class="shine"></i></button>
          <button class="btn-ghost to-menu">NEW ZIP CODE</button>
        </div>
      </div>`;
    parent.appendChild(this.el);
    this.el.querySelector(".retry")!.addEventListener("click", onRetry);
    this.el.querySelector(".to-menu")!.addEventListener("click", onMenu);

    void submit.then((res) => {
      const rank = this.el.querySelector(".end-rank")!;
      if (!res) {
        rank.textContent = "Killboard offline. Your glory dies with you.";
        return;
      }
      rank.textContent = res.rank ? `#${res.rank} IN ${world.place.zip}` : `LOGGED · TOP 10 IN ${world.place.zip} BELOW`;
      this.el.querySelector(".end-board")!.innerHTML = res.board
        .map((e, i) => `<li class="${e.id === res.entry.id ? "me" : ""}"><span>${i + 1}</span><span>${escapeHtml(e.playerName)}</span><span class="sc">${e.score.toLocaleString()}</span></li>`)
        .join("");
    });
  }

  destroy() {
    this.el.remove();
  }
}
