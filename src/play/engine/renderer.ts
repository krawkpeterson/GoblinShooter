import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.9 },
    uChroma: { value: 0.0015 },
    uDamage: { value: 0 },
    uDesat: { value: 0 },
    uFlash: { value: 0 },
    uGrain: { value: 0.028 },
    uFlashColor: { value: new THREE.Color(1, 0.85, 0.6) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uChroma, uDamage, uDesat, uFlash, uGrain;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      float ca = uChroma * (1.0 + r2 * 6.0) + uDamage * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l) * vec3(1.05, 1.0, 0.92), uDesat);
      col = mix(col, col * vec3(1.06, 1.0, 0.94) + vec3(0.01, 0.0, -0.005), 0.6);
      col = (col - 0.5) * 1.06 + 0.5;
      float vig = smoothstep(0.85, 0.15, r2 * uVignette * 2.2);
      col *= mix(1.0, vig, 0.85);
      col = mix(col, vec3(0.55, 0.0, 0.03), uDamage * smoothstep(0.05, 0.5, r2) * 0.85);
      col += uFlashColor * uFlash;
      col += (rand(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly worldPass: RenderPass;
  readonly viewPass: RenderPass;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;

  private readonly onResize = () => this.resize();

  static createWebGL(canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.BasicShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    return r;
  }

  constructor(
    renderer: THREE.WebGLRenderer,
    readonly scene: THREE.Scene,
    readonly camera: THREE.PerspectiveCamera,
    readonly viewScene: THREE.Scene,
    readonly viewCamera: THREE.PerspectiveCamera,
  ) {
    this.renderer = renderer;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(this.renderer, target);
    this.worldPass = new RenderPass(scene, camera);
    this.viewPass = new RenderPass(viewScene, viewCamera);
    this.viewPass.clear = false;
    this.viewPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.28, 0.4, 0.92);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.worldPass);
    this.composer.addPass(this.viewPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    window.addEventListener("resize", this.onResize);
    this.resize();
  }

  dispose() {
    window.removeEventListener("resize", this.onResize);
    this.composer.dispose();
  }

  get u() {
    return this.grade.uniforms as typeof GradeShader.uniforms;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = this.viewCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  render(elapsed: number) {
    this.u.uTime.value = elapsed % 100;
    this.composer.render();
  }
}
