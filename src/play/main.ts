import "./styles/base.css";
import "./styles/menu.css";
import "./styles/loading.css";
import "./styles/hud.css";
import "./styles/touch.css";
import "./styles/overlays.css";
import type * as THREE from "three";
import type { WorldData } from "../../shared/types.ts";
import { AudioEngine } from "./audio/audio.ts";
import { Input } from "./engine/input.ts";
import { Renderer } from "./engine/renderer.ts";
import { Game } from "./game/game.ts";
import { playerId, submitScore, upsertPlayer } from "./net/api.ts";
import { Briefing, Loading } from "./ui/loading.ts";
import { LIGHTING_HOURS, Menu, type DeployRequest } from "./ui/menu.ts";
import { EndOverlay, PauseOverlay } from "./ui/overlays.ts";
import { TouchControls } from "./ui/touchControls.ts";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const ui = document.getElementById("ui-root") as HTMLElement;
const audio = new AudioEngine();
const input = new Input(canvas);
let gl: THREE.WebGLRenderer | null = null;

let menu: Menu | null = null;
let loading: Loading | null = null;
let briefing: Briefing | null = null;
let game: Game | null = null;
let pause: PauseOverlay | null = null;
let end: EndOverlay | null = null;
let touch: TouchControls | null = null;
let lastRequest: DeployRequest | null = null;
let lastWorld: WorldData | null = null;

function clearScreens() {
  menu?.destroy();
  loading?.destroy();
  briefing?.destroy();
  pause?.destroy();
  end?.destroy();
  touch?.destroy();
  menu = loading = briefing = pause = end = touch = null;
}

function showMenu() {
  game?.dispose();
  game = null;
  input.unlock();
  clearScreens();
  canvas.style.visibility = "hidden";
  menu = new Menu(ui, audio, (req) => void deploy(req));
}

async function deploy(req: DeployRequest) {
  lastRequest = req;
  void upsertPlayer(req.callsign);
  const m = menu;
  m?.el.classList.add("fade-out");
  await new Promise((r) => setTimeout(r, 650));
  m?.destroy();
  if (menu === m) menu = null;

  loading = new Loading(ui, req.zip, req.size);
  try {
    const world = await loading.run();
    lastWorld = world;
    launch(world, req);
    loading.el.classList.add("fade-out");
    setTimeout(() => {
      loading?.destroy();
      loading = null;
    }, 600);
  } catch (err) {
    console.error(err);
    loading.showError((err as Error).message || "Battlefield failed to assemble", () => {
      loading?.destroy();
      loading = null;
      void deploy(req);
    }, showMenu);
  }
}

function launch(world: WorldData, req: DeployRequest) {
  game?.dispose();
  gl ??= Renderer.createWebGL(canvas);
  canvas.style.visibility = "visible";
  const lit = req.lighting === "live" ? world : { ...world, director: { ...world.director, timeOfDay: LIGHTING_HOURS[req.lighting] } };
  const g = new Game(lit, gl, input, audio, ui, req.loadout, req.mode);
  game = g;
  g.hud.show(false);
  g.onEnd = (victory, stats) => {
    if (game !== g) return;
    pause?.destroy();
    pause = null;
    const weaponMostUsed = mostUsedWeapon(stats.shotsByWeapon);
    void upsertPlayer(req.callsign);
    const submission = submitScore({
      playerId: playerId(),
      playerName: req.callsign,
      zip: world.place.zip,
      placeName: `${world.place.name}, ${world.place.stateAbbr}`,
      score: stats.score,
      kills: stats.kills,
      headshots: stats.headshots,
      wave: stats.wave,
      accuracy: stats.shots ? stats.hits / stats.shots : 0,
      durationSec: Math.round(stats.durationSec),
      weaponMostUsed,
    });
    end = new EndOverlay(ui, victory, stats, world, submission, () => {
      end?.destroy();
      end = null;
      launch(world, req);
    }, showMenu);
  };

  if (input.touch) {
    touch?.destroy();
    touch = new TouchControls(ui, input, () => input.unlock());
  }

  briefing = new Briefing(ui, world, () => {
    audio.unlock();
    briefing?.destroy();
    briefing = null;
    g.hud.show(true);
    touch?.show(true);
    input.lock();
    g.start();
  });
}

input.onLockChange = (locked) => {
  if (!game || briefing || end || game.isOver) return;
  if (locked) {
    pause?.destroy();
    pause = null;
    touch?.show(true);
    return;
  }
  touch?.show(false);
  if (!pause) {
    pause = new PauseOverlay(ui, input, audio, () => input.lock(), () => showMenu());
  }
};

declare global {
  interface Window {
    __krawk: {
      readonly game: Game | null;
      readonly world: WorldData | null;
      readonly request: DeployRequest | null;
      audio: AudioEngine;
      input: Input;
      capture: (name: string) => Promise<unknown>;
    };
  }
}

window.__krawk = {
  get game() { return game; },
  get world() { return lastWorld; },
  get request() { return lastRequest; },
  audio,
  input,
  async capture(name: string) {
    if (!game) return null;
    game.renderer.render(performance.now() / 1000);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const res = await fetch("/api/dev/screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, dataUrl }),
    });
    return res.json();
  },
};

function mostUsedWeapon(shots: Record<string, number>): "m1911" | "anaconda" {
  const id = Object.entries(shots).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (id === "anaconda" || id === "ruger" || id === "precision" || id === "m60") return "anaconda";
  return "m1911";
}

showMenu();
