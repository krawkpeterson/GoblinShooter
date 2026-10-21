export type GunKind = "m1911" | "anaconda" | "ruger" | "winchester" | "precision" | "m60";

/** Everything is synthesized at runtime: no audio files ship with the game. */
export class AudioEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private sfx: GainNode;
  private musicBus: GainNode;
  private reverbSend: GainNode;
  private echoSend: GainNode;
  private noise: AudioBuffer;
  private lastShot = 0;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  musicIntensity = 0;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    const ctx = this.ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 4;
    limiter.ratio.value = 18;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = Number(localStorage.getItem("krawk.volume") ?? 0.8);
    this.master.connect(limiter);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.22;
    this.musicBus.connect(this.master);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(3.2, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(reverb).connect(this.master);

    const echo = ctx.createDelay(2);
    echo.delayTime.value = 0.31;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const echoLp = ctx.createBiquadFilter();
    echoLp.type = "lowpass";
    echoLp.frequency.value = 1400;
    echo.connect(echoLp).connect(fb).connect(echo);
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0.5;
    this.echoSend.connect(echo);
    echoLp.connect(this.master);
    echoLp.connect(this.reverbSend);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number) {
    this.master.gain.value = v;
    localStorage.setItem("krawk.volume", String(v));
  }
  get volume() { return this.master.gain.value; }

  unlock() {
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  /** Urban canyons get a tighter, louder slapback. */
  setEnvironment(buildingDensity: number) {
    const echo = this.echoSend;
    echo.gain.value = 0.35 + buildingDensity * 0.4;
  }

  private impulse(seconds: number, decay: number) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(2, rate * seconds, rate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, decay);
    }
    return buf;
  }

  private distortion(amount: number) {
    const ws = this.ctx.createWaveShaper();
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    ws.curve = curve;
    ws.oversample = "4x";
    return ws;
  }

  private noiseSrc() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private pan(x: number) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, x));
    return p;
  }

  /** Sharp report + muzzle blast. Kept short so it reads as a gun, not thunder. */
  gunshot(kind: GunKind) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.001;
    this.lastShot = t;
    const spec = {
      m1911: { crack: 4200, body: 1400, sub: 165, dur: 0.16, vol: 0.95, mech: 2600, echo: 0.12 },
      anaconda: { crack: 2800, body: 780, sub: 88, dur: 0.28, vol: 1.15, mech: 900, echo: 0.18 },
      ruger: { crack: 2600, body: 720, sub: 82, dur: 0.26, vol: 1.12, mech: 820, echo: 0.17 },
      winchester: { crack: 1900, body: 620, sub: 70, dur: 0.34, vol: 1.2, mech: 480, echo: 0.2 },
      precision: { crack: 3200, body: 900, sub: 95, dur: 0.32, vol: 1.25, mech: 1100, echo: 0.22 },
      m60: { crack: 2400, body: 680, sub: 78, dur: 0.14, vol: 1.05, mech: 700, echo: 0.1 },
    }[kind];

    const out = ctx.createGain();
    out.gain.value = spec.vol;
    out.connect(this.sfx);
    const room = ctx.createGain();
    room.gain.value = 0.22;
    room.connect(this.reverbSend);
    out.connect(room);

    const primer = ctx.createOscillator();
    primer.type = "square";
    primer.frequency.setValueAtTime(spec.crack, t);
    primer.frequency.exponentialRampToValueAtTime(spec.crack * 0.35, t + 0.012);
    const primerG = ctx.createGain();
    this.env(primerG, t, 0.55, 0.0002, 0.014);
    primer.connect(primerG).connect(out);
    primer.start(t);
    primer.stop(t + 0.03);

    const crack = this.noiseSrc();
    const crackBp = ctx.createBiquadFilter();
    crackBp.type = "bandpass";
    crackBp.frequency.value = spec.crack;
    crackBp.Q.value = 0.7;
    const crackG = ctx.createGain();
    this.env(crackG, t, 1.8, 0.0003, 0.045);
    crack.connect(crackBp).connect(crackG).connect(out);
    crack.start(t, Math.random() * 3);
    crack.stop(t + 0.08);

    const blast = this.noiseSrc();
    const blastLp = ctx.createBiquadFilter();
    blastLp.type = "lowpass";
    blastLp.frequency.setValueAtTime(spec.body, t);
    blastLp.frequency.exponentialRampToValueAtTime(180, t + spec.dur);
    const blastG = ctx.createGain();
    this.env(blastG, t, 1.7, 0.001, spec.dur);
    blast.connect(blastLp).connect(blastG).connect(out);
    blast.start(t, Math.random() * 3);
    blast.stop(t + spec.dur + 0.05);

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(spec.sub, t);
    sub.frequency.exponentialRampToValueAtTime(Math.max(40, spec.sub * 0.45), t + spec.dur * 0.7);
    const subG = ctx.createGain();
    this.env(subG, t, 1.35, 0.002, spec.dur * 0.85);
    sub.connect(subG).connect(out);
    sub.start(t);
    sub.stop(t + spec.dur);

    const slap = this.noiseSrc();
    const slapBp = ctx.createBiquadFilter();
    slapBp.type = "bandpass";
    slapBp.frequency.value = spec.body * 0.7;
    slapBp.Q.value = 1.1;
    const slapG = ctx.createGain();
    slapG.gain.setValueAtTime(0.0001, t);
    slapG.gain.setValueAtTime(0.0001, t + spec.echo);
    slapG.gain.exponentialRampToValueAtTime(0.35, t + spec.echo + 0.004);
    slapG.gain.exponentialRampToValueAtTime(0.0001, t + spec.echo + 0.09);
    slap.connect(slapBp).connect(slapG).connect(out);
    slap.start(t + spec.echo, Math.random() * 3);
    slap.stop(t + spec.echo + 0.12);

    this.click(t + 0.012, spec.mech, 0.22, 0.01);
  }

  /** Wet burst when a goblin pops. */
  gore(x = 0, distance = 8) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = Math.max(0.2, 0.95 * (1 - distance / 70));
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(this.pan(x)).connect(this.sfx);
    out.connect(this.reverbSend);

    const pop = this.noiseSrc();
    const popBp = ctx.createBiquadFilter();
    popBp.type = "bandpass";
    popBp.frequency.value = 700 + Math.random() * 400;
    popBp.Q.value = 0.6;
    const popG = ctx.createGain();
    this.env(popG, t, 1.8, 0.0004, 0.09);
    pop.connect(popBp).connect(this.distortion(2.5)).connect(popG).connect(out);
    pop.start(t, Math.random() * 3);
    pop.stop(t + 0.14);

    const wet = this.noiseSrc();
    const wetLp = ctx.createBiquadFilter();
    wetLp.type = "lowpass";
    wetLp.frequency.setValueAtTime(900, t);
    wetLp.frequency.exponentialRampToValueAtTime(120, t + 0.35);
    const wetG = ctx.createGain();
    this.env(wetG, t, 1.4, 0.002, 0.32);
    wet.connect(wetLp).connect(wetG).connect(out);
    wet.start(t, Math.random() * 3);
    wet.stop(t + 0.4);

    const squelch = ctx.createOscillator();
    squelch.type = "sawtooth";
    squelch.frequency.setValueAtTime(180 + Math.random() * 80, t);
    squelch.frequency.exponentialRampToValueAtTime(40, t + 0.22);
    const sqG = ctx.createGain();
    this.env(sqG, t, 0.7, 0.004, 0.22);
    squelch.connect(sqG).connect(out);
    squelch.start(t);
    squelch.stop(t + 0.28);

    this.metal(t + 0.02, [240, 380], 0.06, 0.12);
  }

  explosion(distance = 10) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const atten = Math.max(0.25, 1 - distance / 120);
    const out = ctx.createGain();
    out.gain.value = 1.6 * atten;
    out.connect(this.sfx);
    out.connect(this.reverbSend);
    out.connect(this.echoSend);

    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(60, t + 3.5);
    const g = ctx.createGain();
    this.env(g, t, 2.2, 0.005, 3.5);
    n.connect(lp).connect(this.distortion(3)).connect(g).connect(out);
    n.start(t, Math.random() * 3);
    n.stop(t + 4);

    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(90, t);
    sub.frequency.exponentialRampToValueAtTime(22, t + 1.6);
    const sg = ctx.createGain();
    this.env(sg, t, 2.6, 0.01, 1.8);
    sub.connect(this.distortion(5)).connect(sg).connect(out);
    sub.start(t);
    sub.stop(t + 2);
  }

  click(t = this.ctx.currentTime, freq = 2200, vol = 0.3, dur = 0.015) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 600;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.0005, dur);
    o.connect(hp).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private metal(t: number, freqs: number[], vol: number, dur: number) {
    for (const f of freqs) {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f * (0.97 + Math.random() * 0.06);
      const g = this.ctx.createGain();
      this.env(g, t, vol, 0.001, dur);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  dryFire() { this.click(undefined, 3200, 0.4, 0.01); }

  reload(kind: GunKind, empty: boolean) {
    const t = this.ctx.currentTime;
    if (kind === "m1911") {
      this.click(t + 0.12, 1200, 0.3, 0.03); // mag release
      this.metal(t + 0.28, [880, 1320], 0.08, 0.15); // mag drops
      this.click(t + 0.95, 900, 0.45, 0.04); // mag seats
      if (empty) {
        this.click(t + 1.45, 1600, 0.5, 0.03);
        this.metal(t + 1.47, [2400, 3600], 0.06, 0.1); // slide release
      }
    } else if (kind === "winchester") {
      this.click(t + 0.08, 700, 0.35, 0.04);
      this.metal(t + 0.2, [480, 900], 0.07, 0.18);
      for (let i = 0; i < (empty ? 6 : 3); i++) this.click(t + 0.45 + i * 0.22, 1400, 0.28, 0.03);
      this.click(t + 1.9, 500, 0.5, 0.05);
    } else if (kind === "precision") {
      this.click(t + 0.1, 900, 0.35, 0.04);
      this.metal(t + 0.35, [700, 1400], 0.08, 0.2);
      this.click(t + 1.1, 1100, 0.4, 0.04);
      this.click(t + 1.85, 600, 0.55, 0.05);
      if (empty) this.metal(t + 2.35, [1800, 2800], 0.06, 0.12);
    } else if (kind === "m60") {
      this.click(t + 0.08, 500, 0.4, 0.05);
      this.metal(t + 0.4, [400, 800], 0.1, 0.25);
      this.click(t + 1.6, 750, 0.45, 0.05);
      this.metal(t + 2.4, [900, 1600], 0.07, 0.15);
    } else {
      this.click(t + 0.1, 700, 0.35, 0.04); // cylinder latch
      this.metal(t + 0.3, [600, 1200], 0.08, 0.3);
      for (let i = 0; i < 6; i++) this.metal(t + 0.55 + i * 0.03 + Math.random() * 0.03, [3800 + i * 200, 5200], 0.05, 0.12); // brass rain
      this.click(t + 1.55, 1100, 0.35, 0.05); // speedloader
      this.click(t + 2.2, 650, 0.6, 0.05); // cylinder slams shut
      for (let i = 0; i < 4; i++) this.click(t + 2.32 + i * 0.045, 2600, 0.12, 0.008); // spin ratchet
    }
  }

  weaponSwap() {
    const t = this.ctx.currentTime;
    this.metal(t, [500, 750], 0.05, 0.2);
    this.click(t + 0.2, 1400, 0.3, 0.02);
  }

  shellTink() {
    const t = this.ctx.currentTime;
    this.metal(t, [4200 + Math.random() * 1500, 6800], 0.045, 0.08);
    this.metal(t + 0.09, [4800 + Math.random() * 900], 0.025, 0.06);
  }

  impact(surface: "dirt" | "hard" | "flesh", x = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = surface === "hard" ? "bandpass" : "lowpass";
    f.frequency.value = surface === "hard" ? 2600 : surface === "flesh" ? 500 : 900;
    const g = ctx.createGain();
    this.env(g, t, surface === "flesh" ? 0.9 : 0.35, 0.001, surface === "flesh" ? 0.12 : 0.08);
    n.connect(f).connect(g).connect(this.pan(x)).connect(this.sfx);
    n.start(t, Math.random() * 3);
    n.stop(t + 0.2);
    if (surface === "hard") this.metal(t, [3100 + Math.random() * 2000], 0.05, 0.12);
  }

  hitmarker(head: boolean) {
    const t = this.ctx.currentTime;
    if (head) {
      this.metal(t, [1567, 2349, 3136], 0.12, 0.35);
    } else {
      this.click(t, 1800, 0.18, 0.02);
    }
  }

  pop22(x = 0, distance = 10) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = Math.max(0.06, 0.38 * (1 - distance / 70));
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(this.pan(x)).connect(this.sfx);
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400 + Math.random() * 800;
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    this.env(g, t, 1.1, 0.001, 0.045);
    n.connect(bp).connect(g).connect(out);
    n.start(t, Math.random() * 3);
    n.stop(t + 0.12);
    this.click(t, 3200 + Math.random() * 600, 0.22, 0.012);
  }

  geezer(kind: "alert" | "hurt" | "death" | "laugh" | "attack", pitch = 1, x = 0, distance = 10) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = Math.max(0.05, 0.48 * (1 - distance / 90));
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(this.pan(x)).connect(this.sfx);
    const voice = (start: number, f0: number, f1: number, dur: number, peak = 1) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(f0 * pitch, start);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f1 * pitch), start + dur);
      const g = ctx.createGain();
      this.env(g, start, peak, 0.03, dur);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 700 * pitch;
      o.connect(f).connect(g).connect(out);
      o.start(start);
      o.stop(start + dur + 0.08);
    };
    switch (kind) {
      case "alert": voice(t, 420, 620, 0.42); break;
      case "attack": voice(t, 520, 380, 0.16, 0.9); break;
      case "hurt": voice(t, 640, 280, 0.2, 1); break;
      case "death": voice(t, 480, 160, 0.9, 1.15); break;
      case "laugh": for (let i = 0; i < 4; i++) voice(t + i * 0.12, 560 - i * 18, 480 - i * 14, 0.1, 0.65); break;
    }
  }

  goblin(kind: "alert" | "hurt" | "death" | "laugh" | "attack", pitch = 1, x = 0, distance = 10) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = Math.max(0.05, 0.5 * (1 - distance / 90));
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(this.pan(x)).connect(this.sfx);
    out.connect(this.reverbSend);

    const voice = (start: number, f0: number, f1: number, dur: number, peak = 1) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0 * pitch, start);
      o.frequency.exponentialRampToValueAtTime(f1 * pitch, start + dur);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 22 + Math.random() * 10;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 30 * pitch;
      lfo.connect(lfoG).connect(o.frequency);
      const f1n = ctx.createBiquadFilter();
      f1n.type = "bandpass";
      f1n.frequency.value = 900 * pitch;
      f1n.Q.value = 3;
      const f2n = ctx.createBiquadFilter();
      f2n.type = "bandpass";
      f2n.frequency.value = 2100 * pitch;
      f2n.Q.value = 5;
      const g = ctx.createGain();
      this.env(g, start, peak, 0.02, dur);
      o.connect(f1n).connect(g);
      o.connect(f2n).connect(g);
      g.connect(out);
      o.start(start);
      lfo.start(start);
      o.stop(start + dur + 0.1);
      lfo.stop(start + dur + 0.1);
    };

    switch (kind) {
      case "alert": voice(t, 300, 620, 0.45); break;
      case "attack": voice(t, 420, 260, 0.25, 1.2); break;
      case "hurt": voice(t, 560, 380, 0.18, 0.9); break;
      case "death": voice(t, 520, 90, 0.9, 1.3); break;
      case "laugh": for (let i = 0; i < 4; i++) voice(t + i * 0.14, 380 - i * 15, 300 - i * 15, 0.1, 0.8); break;
    }
  }

  footstep(sprint: boolean) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 350 + Math.random() * 200;
    const g = ctx.createGain();
    this.env(g, t, sprint ? 0.32 : 0.2, 0.004, 0.09);
    n.connect(lp).connect(g).connect(this.sfx);
    n.start(t, Math.random() * 3);
    n.stop(t + 0.15);
  }

  land(hard: number) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = this.ctx.createGain();
    this.env(g, t, Math.min(1, 0.3 + hard * 0.1), 0.003, 0.18);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.3);
    this.footstep(true);
  }

  hurt() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    const g = this.ctx.createGain();
    this.env(g, t, 0.5, 0.005, 0.3);
    o.connect(this.distortion(3)).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.4);
  }

  whoosh(up = true, dur = 0.6) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(up ? 200 : 3000, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 3000 : 150, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g).connect(this.sfx);
    g.connect(this.reverbSend);
    n.start(t, Math.random() * 3);
    n.stop(t + dur + 0.05);
  }

  sting(level: number) {
    const t = this.ctx.currentTime;
    const notes = [0, 3, 7, 10, 12].slice(0, 2 + Math.min(3, level));
    notes.forEach((semi, i) => {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 220 * Math.pow(2, semi / 12);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      const g = this.ctx.createGain();
      this.env(g, t + i * 0.06, 0.12, 0.01, 0.5);
      o.connect(lp).connect(g).connect(this.sfx);
      g.connect(this.reverbSend);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 0.6);
    });
  }

  uiTick() { this.click(undefined, 3000, 0.08, 0.01); }

  uiDeploy() {
    this.whoosh(true, 0.9);
    setTimeout(() => this.gunshot("anaconda"), 850);
  }

  fireball(x = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(1600, t + 0.4);
    const g = ctx.createGain();
    this.env(g, t, 0.4, 0.05, 0.5);
    n.connect(bp).connect(g).connect(this.pan(x)).connect(this.sfx);
    n.start(t, Math.random() * 3);
    n.stop(t + 0.6);
  }

  heartbeat() {
    const t = this.ctx.currentTime;
    for (const off of [0, 0.22]) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(70, t + off);
      o.frequency.exponentialRampToValueAtTime(40, t + off + 0.12);
      const g = this.ctx.createGain();
      this.env(g, t + off, off ? 0.35 : 0.5, 0.005, 0.14);
      o.connect(g).connect(this.sfx);
      o.start(t + off);
      o.stop(t + off + 0.2);
    }
  }

  /** Lookahead-scheduled combat track; intensity 0..1 adds layers. */
  startMusic() {
    if (this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  stopMusic() {
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic() {
    const sixteenth = 60 / 138 / 4;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.musicStep, this.nextNoteTime);
      this.nextNoteTime += sixteenth;
      this.musicStep = (this.musicStep + 1) % 64;
    }
  }

  private playStep(step: number, t: number) {
    const ctx = this.ctx;
    const I = this.musicIntensity;
    const bus = this.musicBus;
    const s16 = step % 16;
    if (I > 0.15 && s16 % 4 === 0) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      const g = ctx.createGain();
      this.env(g, t, 1.2, 0.002, 0.25);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.3);
    }
    if (I > 0.45 && (s16 === 4 || s16 === 12)) {
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      const g = ctx.createGain();
      this.env(g, t, 0.6, 0.001, 0.15);
      n.connect(bp).connect(g).connect(bus);
      n.start(t, Math.random() * 3);
      n.stop(t + 0.2);
    }
    if (I > 0.3 && s16 % 2 === 0) {
      const n = this.noiseSrc();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      this.env(g, t, s16 % 4 === 2 ? 0.18 : 0.08, 0.001, 0.04);
      n.connect(hp).connect(g).connect(bus);
      n.start(t, Math.random() * 3);
      n.stop(t + 0.06);
    }
    const riff = [0, 0, 12, 0, 3, 0, 5, 3, 0, 0, 12, 0, 7, 6, 5, 3];
    if (I > 0.05 && (I >= 0.3 || s16 % 4 === 0)) {
      const bar = Math.floor(step / 16);
      const root = [40, 40, 43, 38][bar];
      const semi = riff[s16];
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 440 * Math.pow(2, (root + semi - 69) / 12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 8;
      lp.frequency.setValueAtTime(300 + I * 1600, t);
      lp.frequency.exponentialRampToValueAtTime(120, t + 0.12);
      const g = ctx.createGain();
      this.env(g, t, 0.35, 0.003, 0.13);
      o.connect(lp).connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.2);
    }
  }

  say(text: string, opts: { pitch?: number; rate?: number; volume?: number } = {}) {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const pick =
      voices.find((v) => /Daniel|Fred|Alex|Google UK English Male|Arthur/i.test(v.name)) ??
      voices.find((v) => v.lang.startsWith("en"));
    if (pick) u.voice = pick;
    u.pitch = opts.pitch ?? 0.6;
    u.rate = opts.rate ?? 1.05;
    u.volume = (opts.volume ?? 1) * Math.min(1, this.volume + 0.2);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  get timeSinceShot() { return this.ctx.currentTime - this.lastShot; }
}
