import * as THREE from "three";

/** Billboard HP bar attached above an enemy. */
export function makeHealthBar(width = 1.15, height = 0.12): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 16;
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(width, height, 1);
  sprite.center.set(0.5, 0);
  sprite.userData.canvas = canvas;
  sprite.userData.ctx = canvas.getContext("2d")!;
  sprite.userData.frac = -1;
  return sprite;
}

export function updateHealthBar(sprite: THREE.Sprite, hp: number, maxHp: number, visible: boolean) {
  sprite.visible = visible && hp > 0;
  if (!sprite.visible) return;
  const frac = Math.max(0, Math.min(1, hp / maxHp));
  if (Math.abs(frac - (sprite.userData.frac as number)) < 0.01) return;
  sprite.userData.frac = frac;
  const canvas = sprite.userData.canvas as HTMLCanvasElement;
  const ctx = sprite.userData.ctx as CanvasRenderingContext2D;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = frac > 0.45 ? "#3dff7a" : frac > 0.2 ? "#ffc23a" : "#ff3a3a";
  ctx.fillRect(3, 3, Math.max(0, (w - 6) * frac), h - 6);
  (sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
}
