import * as THREE from "three";
import type { Director, Weather } from "../../../shared/types.ts";

export class SkySystem {
  readonly dome: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDir = new THREE.Vector3();
  /** 0 = full day, 1 = deep night. Drives window glow. */
  readonly night: number;
  private precip: THREE.Points | null = null;
  private precipVel = 0;

  constructor(scene: THREE.Scene, director: Director, weather: Weather) {
    const pal = director.palette;
    const t = director.timeOfDay;
    const elev = Math.sin(((t - 6) / 12) * Math.PI);
    const sunElev = THREE.MathUtils.degToRad(Math.max(-12, elev * 68));
    const sunAz = THREE.MathUtils.degToRad(90 + ((t - 6) / 12) * 180);
    this.sunDir.set(Math.cos(sunElev) * Math.cos(sunAz), Math.sin(sunElev), Math.cos(sunElev) * Math.sin(sunAz)).normalize();
    this.night = THREE.MathUtils.clamp(1 - (elev + 0.15) / 0.45, 0, 1);

    const skyTop = new THREE.Color(pal.sky).lerp(new THREE.Color("#0c1530"), this.night * 0.8);
    const horizon = new THREE.Color(pal.horizon).lerp(new THREE.Color("#2a2448"), this.night * 0.65);
    const fogColor = new THREE.Color(pal.fog).lerp(new THREE.Color("#1c2238"), this.night * 0.6);
    const overcast = weather.cloudCover / 100;

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(4000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: skyTop },
          uHorizon: { value: horizon },
          uSunDir: { value: this.sunDir },
          uSunColor: { value: new THREE.Color(pal.sun) },
          uNight: { value: this.night },
          uCloud: { value: overcast },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop, uHorizon, uSunDir, uSunColor;
          uniform float uNight, uCloud, uTime;
          varying vec3 vDir;
          float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a*n(p); p *= 2.1; a *= 0.5; } return v; }
          void main() {
            vec3 d = normalize(vDir);
            float y = max(d.y, 0.0);
            vec3 col = mix(uHorizon, uTop, pow(y, 0.55));
            float s = max(dot(d, normalize(uSunDir)), 0.0);
            col += uSunColor * (pow(s, 900.0) * 30.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12) * (1.0 - uNight * 0.9);
            vec2 cp = d.xz / max(d.y, 0.08) * 0.6 + vec2(uTime * 0.004, uTime * 0.002);
            float c = smoothstep(0.55 - uCloud * 0.35, 0.95, fbm(cp));
            vec3 cloudCol = mix(vec3(1.0), uHorizon, 0.35) * (1.0 - uNight * 0.85);
            col = mix(col, cloudCol, c * smoothstep(0.0, 0.25, d.y) * 0.85);
            vec3 sc = floor(d * 260.0);
            float stars = step(0.9985, h(sc.xy + sc.z * 17.31)) * uNight * smoothstep(0.05, 0.3, d.y) * (1.0 - c);
            col += vec3(stars);
            col = mix(col, uHorizon, smoothstep(0.08, -0.05, d.y));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    scene.fog = new THREE.FogExp2(fogColor, director.fogDensity * (1 + this.night * 0.5));
    scene.background = fogColor;

    const sunIntensity = THREE.MathUtils.lerp(3.2, 1.25, this.night) * (1 - overcast * 0.4);
    this.sun = new THREE.DirectionalLight(
      this.night > 0.6 ? new THREE.Color("#9fb6ff") : new THREE.Color(pal.sun),
      sunIntensity,
    );
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.autoUpdate = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -42;
    sc.right = sc.top = 42;
    sc.near = 1;
    sc.far = 320;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(skyTop.clone().lerp(new THREE.Color("#ffffff"), 0.35), new THREE.Color(pal.ground).multiplyScalar(0.6), THREE.MathUtils.lerp(1.15, 0.9, this.night));
    scene.add(this.hemi);

    if (weather.code >= 51 && weather.code <= 82) this.addPrecip(scene, weather.code >= 71 && weather.code <= 77 ? "snow" : "rain");
  }

  private addPrecip(scene: THREE.Scene, kind: "rain" | "snow") {
    const n = kind === "rain" ? 6000 : 4000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.precip = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: kind === "rain" ? 0xaaccff : 0xffffff,
        size: kind === "rain" ? 0.06 : 0.14,
        transparent: true,
        opacity: kind === "rain" ? 0.55 : 0.85,
        depthWrite: false,
      }),
    );
    this.precip.frustumCulled = false;
    this.precipVel = kind === "rain" ? 28 : 2.5;
    scene.add(this.precip);
  }

  update(dt: number, elapsed: number, focus: THREE.Vector3) {
    (this.dome.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
    this.dome.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir.y > 0.05 ? this.sunDir : new THREE.Vector3(0.3, 0.8, 0.2).normalize(), 250);
    this.sun.target.position.copy(focus);
    if (this.precip) {
      const p = this.precip.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - this.precipVel * dt;
        if (y < 0) y += 40;
        p.setY(i, y);
        if (this.precipVel < 5) p.setX(i, p.getX(i) + Math.sin(elapsed + i) * dt * 0.5);
      }
      p.needsUpdate = true;
      this.precip.position.set(focus.x, focus.y - 10, focus.z);
    }
  }
}
