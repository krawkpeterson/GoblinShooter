import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { pointInPolygon } from "../../../shared/geometry.ts";
import type { Building, Road, Vec2, WorldData } from "../../../shared/types.ts";
import type { BuildingCollider, CollisionWorld } from "./collision.ts";
import { hash2, type Terrain } from "./terrain.ts";

const WIN_CELLS = 8;

function windowTextures(urban: boolean) {
  const S = 512, cell = S / WIN_CELLS;
  const base = document.createElement("canvas");
  base.width = base.height = S;
  const lit = document.createElement("canvas");
  lit.width = lit.height = S;
  const b = base.getContext("2d")!;
  const l = lit.getContext("2d")!;
  b.fillStyle = "#f2efe9";
  b.fillRect(0, 0, S, S);
  l.fillStyle = "#000";
  l.fillRect(0, 0, S, S);
  for (let i = 0; i < WIN_CELLS; i++) {
    for (let j = 0; j < WIN_CELLS; j++) {
      const x = i * cell, y = j * cell;
      b.fillStyle = "rgba(0,0,0,0.05)";
      b.fillRect(x, y + cell - 6, cell, 6);
      const wx = x + cell * 0.22, wy = y + cell * 0.2, ww = cell * 0.56, wh = cell * 0.55;
      const g = b.createLinearGradient(wx, wy, wx + ww, wy + wh);
      g.addColorStop(0, "#2c3a48");
      g.addColorStop(0.5, "#4f6478");
      g.addColorStop(1, "#1d2732");
      b.fillStyle = g;
      b.fillRect(wx, wy, ww, wh);
      b.fillStyle = "rgba(255,255,255,0.18)";
      b.fillRect(wx + ww * 0.48, wy, 2, wh);
      if (Math.random() < (urban ? 0.42 : 0.28)) {
        const warm = Math.random() < 0.8;
        l.fillStyle = warm ? `hsl(${36 + Math.random() * 14}, 95%, ${55 + Math.random() * 20}%)` : "#bfe4ff";
        l.fillRect(wx, wy, ww, wh);
      }
    }
  }
  const map = new THREE.CanvasTexture(base);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const emissiveMap = new THREE.CanvasTexture(lit);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  return { map, emissiveMap };
}

const HOUSE_KINDS = new Set(["house", "detached", "semidetached_house", "bungalow", "residential", "yes", "terrace", "cabin", "farm"]);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296;
}

function wallColor(b: Building, biome: string, r: number): THREE.Color {
  const desert = biome === "desert";
  const pick = (arr: string[]) => new THREE.Color(arr[Math.floor(r * arr.length) % arr.length]);
  switch (b.kind) {
    case "commercial": case "office": case "retail":
      return pick(["#9aa6b2", "#7d8b99", "#b9b2a5", "#6c7a86", "#a8b8c4"]);
    case "industrial": case "warehouse":
      return pick(["#8c8a83", "#9b968a", "#7a7f84", "#a39f94"]);
    case "church": case "cathedral":
      return pick(["#d8cdb8", "#bfae95"]);
    case "apartments":
      return pick(["#c9b9a3", "#d4cfc6", "#b08f76", "#9fa7ad", "#e0d6c4"]);
    default:
      return desert
        ? pick(["#d9b98f", "#cfa77c", "#e2cba6", "#c49a6c", "#e8dcc3"])
        : pick(["#e9e3d6", "#d8c8b0", "#c9b8a0", "#f0ece4", "#b7a58c", "#d9d2c4", "#a9b3ad"]);
  }
}

function roofColor(house: boolean, biome: string, r: number): THREE.Color {
  if (!house) return new THREE.Color(["#7b7b78", "#8e8d88", "#6c6e70", "#a09d95"][Math.floor(r * 4)]);
  return new THREE.Color(
    biome === "desert" || biome === "coastal" || biome === "urban"
      ? ["#a8553a", "#b8623f", "#8f4a35", "#5c5650"][Math.floor(r * 4)]
      : ["#4b4743", "#5c534b", "#3e4247", "#6b3d32"][Math.floor(r * 4)],
  );
}

export interface CityBuild {
  group: THREE.Group;
  buildingMeshes: THREE.Mesh[];
  colliders: BuildingCollider[];
  windowMaterial: THREE.MeshStandardMaterial;
  water: THREE.Mesh[];
  waterMaterial: THREE.MeshStandardMaterial;
  cars: CarSystem;
}

export function buildCity(world: WorldData, terrain: Terrain, collision: (c: BuildingCollider[]) => CollisionWorld): {
  build: CityBuild;
  collisionWorld: CollisionWorld;
} {
  const group = new THREE.Group();
  const biome = world.director.biome;
  const { map, emissiveMap } = windowTextures(biome === "urban");

  const walls = { pos: [] as number[], nor: [] as number[], uv: [] as number[], col: [] as number[] };
  const roofs = { pos: [] as number[], nor: [] as number[], col: [] as number[] };
  const colliders: BuildingCollider[] = [];

  world.buildings.forEach((b, idx) => {
    try {
    const pts = b.footprint;
    if (pts.length < 3) return;
    const r = rng(idx * 7919 + pts.length);
    const hs = pts.map(([x, z]) => terrain.heightAt(x, z));
    const ground = hs.reduce((a, h) => a + h, 0) / hs.length;
    const lift = b.minHeight ?? 0;
    const floorY = ground + lift;
    const base = Math.min(...hs) - 0.85;
    const top = Math.max(floorY + Math.max(2.4, b.height - lift), Math.max(...hs) + 2.4);
    const area = polyArea(pts);
    const house = HOUSE_KINDS.has(b.kind) && area < 450 && pts.length <= 10 && b.height < 12;
    const enterable = area > 18 && top - floorY > 2.3 && b.kind !== "roof" && b.kind !== "garage";
    let doorIdx = -1, doorLen = 0;
    if (enterable) {
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
        const elen = Math.hypot(bx - ax, bz - az);
        if (elen > doorLen) { doorLen = elen; doorIdx = i; }
      }
    }

    let flip = false;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.3) continue;
      const nx = (bz - az) / len, nz = -(bx - ax) / len;
      flip = pointInPolygon((ax + bx) / 2 + nx * 0.05, (az + bz) / 2 + nz * 0.05, pts);
      break;
    }

    const wc = wallColor(b, biome, r());
    const shade = 0.88 + r() * 0.2;
    let perim = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      let nx = dz / len, nz = -dx / len;
      if (flip) { nx = -nx; nz = -nz; }
      const sameAsCross = nx * -dz + nz * dx > 0;
      const A = sameAsCross ? [ax, az] : [bx, bz];
      const B = sameAsCross ? [bx, bz] : [ax, az];
      const uA = sameAsCross ? perim : perim + len;
      const uB = sameAsCross ? perim + len : perim;
      const doorEdge = i === doorIdx && len > 1.8;
      const doorW = Math.min(1.35, len * 0.28);
      const doorH = Math.min(2.25, (top - floorY) * 0.72);
      const uv = (u: number, v: number) => [u / 3.6 / WIN_CELLS, v];
      const pushWall = (ax0: number, az0: number, bx0: number, bz0: number, y0: number, y1: number, u0: number, u1: number) => {
        const a0 = [ax0, y0, az0], b0 = [bx0, y0, bz0], b1 = [bx0, y1, bz0], a1 = [ax0, y1, az0];
        const v0 = (y0 - base) / 3.4 / WIN_CELLS, v1 = (y1 - base) / 3.4 / WIN_CELLS;
        const tri = [a0, b0, b1, a0, b1, a1];
        const tuv = [uv(u0, v0), uv(u1, v0), uv(u1, v1), uv(u0, v0), uv(u1, v1), uv(u0, v1)];
        for (let k = 0; k < 6; k++) {
          walls.pos.push(...tri[k]);
          walls.nor.push(nx, 0, nz);
          walls.uv.push(...tuv[k]);
          walls.col.push(wc.r * shade, wc.g * shade, wc.b * shade);
        }
      };
      if (doorEdge) {
        const t0 = 0.5 - doorW / 2 / len, t1 = 0.5 + doorW / 2 / len;
        const sx = A[0] + (B[0] - A[0]) * t0, sz = A[1] + (B[1] - A[1]) * t0;
        const ex = A[0] + (B[0] - A[0]) * t1, ez = A[1] + (B[1] - A[1]) * t1;
        const uS = uA + (uB - uA) * t0, uE = uA + (uB - uA) * t1;
        pushWall(A[0], A[1], sx, sz, base, top, uA, uS);
        pushWall(ex, ez, B[0], B[1], base, top, uE, uB);
        pushWall(sx, sz, ex, ez, floorY + doorH, top, uS, uE);
      } else {
        pushWall(A[0], A[1], B[0], B[1], base, top, uA, uB);
      }
      perim += len;
    }

    const rc = roofColor(house, biome, r());
    const pushRoof = (p: number[][], n: THREE.Vector3) => {
      for (const v of p) {
        roofs.pos.push(...v);
        roofs.nor.push(n.x, n.y, n.z);
        roofs.col.push(rc.r, rc.g, rc.b);
      }
    };
    if (house) {
      let cx = 0, cz = 0;
      for (const [x, z] of pts) { cx += x; cz += z; }
      cx /= pts.length;
      cz /= pts.length;
      const apex = [cx, top + Math.min(3.2, Math.sqrt(area) * 0.22), cz];
      for (let i = 0; i < pts.length; i++) {
        const pa = [pts[i][0], top, pts[i][1]], pb = [pts[(i + 1) % pts.length][0], top, pts[(i + 1) % pts.length][1]];
        const e1 = new THREE.Vector3(pb[0] - pa[0], 0, pb[2] - pa[2]);
        const e2 = new THREE.Vector3(apex[0] - pa[0], apex[1] - pa[1], apex[2] - pa[2]);
        const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
        if (n.y < 0) pushRoof([pb, pa, apex], n.negate());
        else pushRoof([pa, pb, apex], n);
      }
    } else {
      fanRoof(pts, top, (p, n) => pushRoof(p, n));
    }
    if (enterable) {
      fanRoof(pts, floorY + 0.04, (p, n) => {
        const up = n.y >= 0 ? n : n.clone().negate();
        pushRoof(p.map((v) => [v[0], floorY + 0.04, v[2]]), up);
      });
    }
    const door = enterable ? doorOnLongest(pts, Math.min(2.25, (top - floorY) * 0.72)) : undefined;
    colliders.push({ poly: pts, base, top, floor: floorY, hollow: enterable, door });
    } catch {
      /* skip degenerate OSM footprints so one bad roof cannot freeze load */
    }
  });

  const windowMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    emissiveMap,
    emissive: new THREE.Color("#ffffff"),
    emissiveIntensity: 0,
    roughness: 0.78,
    metalness: 0.05,
  });
  const buildingMeshes: THREE.Mesh[] = [];
  if (walls.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(walls.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(walls.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(walls.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(walls.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, windowMaterial);
    m.castShadow = m.receiveShadow = true;
    m.name = "buildings";
    buildingMeshes.push(m);
    group.add(m);
  }
  if (roofs.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(roofs.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(roofs.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(roofs.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    m.castShadow = m.receiveShadow = true;
    m.name = "roofs";
    buildingMeshes.push(m);
    group.add(m);
  }

  group.add(buildRoads(world.roads, terrain));

  const waterMaterial = waterMat();
  const water: THREE.Mesh[] = [];
  for (const a of world.areas) {
    if (a.kind !== "water" || a.polygon.length < 3) continue;
    const ys = a.polygon.map(([x, z]) => terrain.heightAt(x, z));
    const y = Math.min(...ys) + 0.35;
    try {
      const shape = new THREE.Shape(a.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, waterMaterial);
      m.position.y = y;
      m.receiveShadow = true;
      water.push(m);
      group.add(m);
    } catch { /* skip bad water polygons */ }
  }
  if (terrain.seaLevel !== null) {
    const g = new THREE.PlaneGeometry(terrain.size * 4, terrain.size * 4, 1, 1);
    g.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(g, waterMaterial);
    sea.position.y = terrain.seaLevel + 0.2;
    water.push(sea);
    group.add(sea);
  }

  const collisionWorld = collision(colliders);
  group.add(buildTrees(world, terrain, collisionWorld));
  const cars = new CarSystem(world, terrain, collisionWorld);
  group.add(cars.group);

  return {
    build: { group, buildingMeshes, colliders, windowMaterial, water, waterMaterial, cars },
    collisionWorld,
  };
}

function doorOnLongest(pts: Vec2[], height: number) {
  let bi = 0, bl = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len > bl) { bl = len; bi = i; }
  }
  const [ax, az] = pts[bi], [bx, bz] = pts[(bi + 1) % pts.length];
  const w = Math.min(1.35, bl * 0.28);
  return { ax, az, bx, bz, t0: 0.5 - w / 2 / bl, t1: 0.5 + w / 2 / bl, height };
}

function fanRoof(pts: Vec2[], y: number, push: (p: number[][], n: THREE.Vector3) => void) {
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
  let faces: number[][] = [];
  try {
    faces = THREE.ShapeUtils.triangulateShape(contour, []);
  } catch {
    let cx = 0, cz = 0;
    for (const [x, z] of pts) { cx += x; cz += z; }
    cx /= pts.length; cz /= pts.length;
    for (let i = 0; i < pts.length; i++) {
      const pa = pts[i], pb = pts[(i + 1) % pts.length];
      const n = new THREE.Vector3(0, 1, 0);
      push([[pa[0], y, pa[1]], [pb[0], y, pb[1]], [cx, y, cz]], n);
    }
    return;
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const [ia, ib, ic] of faces) {
    const pa = pts[ia], pb = pts[ib], pc = pts[ic];
    if (!pa || !pb || !pc) continue;
    const cy = (pb[1] - pa[1]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[1] - pa[1]);
    const tri = cy >= 0 ? [pa, pb, pc] : [pa, pc, pb];
    push(tri.map(([x, z]) => [x, y, z]), up);
  }
}

function polyArea(poly: Vec2[]) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}

const ROAD_STYLE: Record<Road["kind"], { color: string; lift: number }> = {
  motorway: { color: "#45474b", lift: 0.14 },
  primary: { color: "#4b4d51", lift: 0.13 },
  secondary: { color: "#525457", lift: 0.12 },
  residential: { color: "#58595b", lift: 0.11 },
  service: { color: "#626260", lift: 0.1 },
  path: { color: "#9a8a6c", lift: 0.09 },
};

function buildRoads(roads: Road[], terrain: Terrain): THREE.Group {
  const group = new THREE.Group();
  const pos: number[] = [], col: number[] = [];
  const mpos: number[] = [], mcol: number[] = [];
  const tmp = new THREE.Color();

  const ribbon = (pts: Vec2[], width: number, lift: number, color: THREE.Color, P: number[], C: number[], dash?: [number, number]) => {
    const dense: Vec2[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
      for (let s = 0; s < n; s++) dense.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n]);
    }
    dense.push(pts[pts.length - 1]);
    if (dense.length < 2) return;
    const half = width / 2;
    const L: number[][] = [], R: number[][] = [], D: number[] = [];
    let dist = 0;
    for (let i = 0; i < dense.length; i++) {
      const p = dense[i];
      const prev = dense[Math.max(0, i - 1)], next = dense[Math.min(dense.length - 1, i + 1)];
      let tx = next[0] - prev[0], tz = next[1] - prev[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const nx = -tz, nz = tx;
      if (i > 0) dist += Math.hypot(p[0] - dense[i - 1][0], p[1] - dense[i - 1][1]);
      const lx = p[0] + nx * half, lz = p[1] + nz * half, rx = p[0] - nx * half, rz = p[1] - nz * half;
      L.push([lx, Math.max(terrain.heightAt(lx, lz), terrain.heightAt(p[0], p[1])) + lift, lz]);
      R.push([rx, Math.max(terrain.heightAt(rx, rz), terrain.heightAt(p[0], p[1])) + lift, rz]);
      D.push(dist);
    }
    for (let i = 0; i < dense.length - 1; i++) {
      if (dash) {
        const mid = (D[i] + D[i + 1]) / 2;
        if (mid % (dash[0] + dash[1]) > dash[0]) continue;
      }
      // R_i, L_i, L_i+1 / R_i, L_i+1, R_i+1 : counter-clockwise seen from above
      const quad = [R[i], L[i], L[i + 1], R[i], L[i + 1], R[i + 1]];
      for (const v of quad) {
        P.push(...v);
        C.push(color.r, color.g, color.b);
      }
    }
  };

  for (const r of roads) {
    const isWater = r.name?.startsWith("~water");
    const style = ROAD_STYLE[r.kind];
    tmp.set(isWater ? "#2a6a8f" : style.color);
    ribbon(r.points, r.width, isWater ? 0.25 : style.lift, tmp.clone(), pos, col);
    if (!isWater && (r.kind === "primary" || r.kind === "secondary" || r.kind === "motorway")) {
      ribbon(r.points, 0.22, style.lift + 0.02, new THREE.Color(r.kind === "motorway" ? "#f5f5f0" : "#e8c547"), mpos, mcol, [3, 6]);
    }
  }
  const make = (P: number[], C: number[], rough: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    m.receiveShadow = true;
    return m;
  };
  if (pos.length) group.add(make(pos, col, 0.88));
  if (mpos.length) group.add(make(mpos, mcol, 0.6));
  group.name = "roads";
  return group;
}

function waterMat() {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#1d5873"),
    roughness: 0.06,
    metalness: 0.35,
    transparent: true,
    opacity: 0.9,
  });
  const uniforms = { uTime: { value: 0 } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nuniform float uTime;")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
         vec2 wp = vWPos.xz;
         float w1 = sin(wp.x * 0.35 + uTime * 1.3) * cos(wp.y * 0.27 - uTime * 0.9);
         float w2 = sin(wp.x * 1.7 - uTime * 2.1 + wp.y * 1.3) * 0.5;
         normal = normalize(normal + vec3(w1 * 0.08 + w2 * 0.05, 0.0, w2 * 0.06 - w1 * 0.05));`,
      );
  };
  return mat;
}

type TreeKind = "broadleaf" | "conifer" | "palm";

function treeKindFor(world: WorldData, r: number): TreeKind {
  const b = world.director.biome;
  const lat = world.place.lat;
  if ((b === "coastal" || b === "desert" || b === "urban") && lat < 36.5) return r < 0.55 ? "palm" : "broadleaf";
  if (b === "mountain" || b === "frozen") return r < 0.75 ? "conifer" : "broadleaf";
  if (b === "forest") return r < 0.45 ? "conifer" : "broadleaf";
  return r < 0.15 ? "conifer" : "broadleaf";
}

function buildTrees(world: WorldData, terrain: Terrain, collision: CollisionWorld): THREE.Group {
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const broadGeo = new THREE.IcosahedronGeometry(1, 1);
  const coneGeo = mergeGeometries([
    new THREE.ConeGeometry(1, 1.2, 8).translate(0, 0.6, 0),
    new THREE.ConeGeometry(0.75, 1, 8).translate(0, 1.15, 0),
  ]);
  const frond = () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.BoxGeometry(0.55, 0.05, 3.6);
      g.translate(0, 0, 1.8);
      g.rotateX(0.45 + (i % 2) * 0.15);
      g.rotateY((i / 9) * Math.PI * 2);
      parts.push(g);
    }
    return mergeGeometries(parts);
  };
  const palmGeo = frond();

  const trees = world.trees;
  const kinds = trees.map((p) => treeKindFor(world, hash2(p[0], p[1])));
  const count = (k: TreeKind) => kinds.filter((x) => x === k).length;
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: "#5a4330", roughness: 1 }), trees.length);
  const crowns: Record<TreeKind, THREE.InstancedMesh> = {
    broadleaf: new THREE.InstancedMesh(broadGeo, leafMat, Math.max(1, count("broadleaf"))),
    conifer: new THREE.InstancedMesh(coneGeo, leafMat, Math.max(1, count("conifer"))),
    palm: new THREE.InstancedMesh(palmGeo, leafMat, Math.max(1, count("palm"))),
  };
  const idx: Record<TreeKind, number> = { broadleaf: 0, conifer: 0, palm: 0 };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const base = new THREE.Color(world.director.palette.grass);
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  trees.forEach(([x, z], i) => {
    const r1 = hash2(x * 1.3, z * 0.7), r2 = hash2(z * 2.1, x * 0.3);
    const kind = kinds[i];
    const y = terrain.heightAt(x, z) - 0.2;
    const scale = 0.8 + r1 * 0.6;
    const trunkH = kind === "palm" ? 8 + r2 * 5 : kind === "conifer" ? 2.5 * scale : 3 * scale;
    q.setFromAxisAngle(up, r2 * Math.PI * 2);
    trunks.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.set(scale * (kind === "palm" ? 0.9 : 1), trunkH, scale)));
    const j = idx[kind]++;
    if (kind === "broadleaf") m.compose(p.set(x, y + trunkH + 1.6 * scale, z), q, s.set(2.6 * scale, 2.2 * scale, 2.6 * scale));
    else if (kind === "conifer") m.compose(p.set(x, y + trunkH * 0.6, z), q, s.set(2.2 * scale, 5.2 * scale, 2.2 * scale));
    else m.compose(p.set(x, y + trunkH, z), q, s.set(scale, scale, scale));
    crowns[kind].setMatrixAt(j, m);
    c.copy(base).offsetHSL((r1 - 0.5) * 0.06, (r2 - 0.5) * 0.15, (r2 - 0.5) * 0.12 - (kind === "conifer" ? 0.08 : 0));
    crowns[kind].setColorAt(j, c);
    collision.addCircle({ x, z, r: 0.4 * scale, top: y + trunkH + 4 });
  });

  trunks.castShadow = true;
  group.add(trunks);
  for (const k of Object.keys(crowns) as TreeKind[]) {
    const mesh = crowns[k];
    mesh.count = idx[k];
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  group.name = "trees";
  return group;
}

export interface Car {
  index: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  hp: number;
  dead: boolean;
  color: THREE.Color;
  anim: number;
  roll: number;
}

const CAR_COLORS = ["#c0c4c8", "#1b1d20", "#f2f2ef", "#8a1d1d", "#1e3a6b", "#5a5f63", "#c7a24a", "#2f5e3a", "#d94c1a", "#7d8a96"];

/** Parked cars along real roads: cover, obstacles, and very satisfying fireballs. */
export class CarSystem {
  readonly group = new THREE.Group();
  readonly cars: Car[] = [];
  private bodies: THREE.InstancedMesh;
  private cabins: THREE.InstancedMesh;
  private chassis: THREE.InstancedMesh;
  static readonly HALF = new THREE.Vector3(2.25, 0.8, 0.98);

  constructor(world: WorldData, private terrain: Terrain, collision: CollisionWorld) {
    const r = rng(Number(world.place.zip) || 7);
    const spots: Omit<Car, "index">[] = [];
    for (const road of world.roads) {
      if (!["residential", "secondary", "primary", "service"].includes(road.kind) || road.name?.startsWith("~water")) continue;
      for (let i = 0; i < road.points.length - 1 && spots.length < 160; i++) {
        const [ax, az] = road.points[i], [bx, bz] = road.points[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        let d = 6 + r() * 20;
        while (d < len - 4 && spots.length < 160) {
          if (r() < 0.35) {
            const t = d / len;
            const tx = (bx - ax) / len, tz = (bz - az) / len;
            const side = r() < 0.5 ? 1 : -1;
            const off = road.width / 2 - 1.1;
            const x = ax + (bx - ax) * t + -tz * off * side;
            const z = az + (bz - az) * t + tx * off * side;
            if (Math.abs(x) < terrain.half - 8 && Math.abs(z) < terrain.half - 8 && !collision.buildingAt(x, z) &&
                !spots.some((s) => Math.hypot(s.x - x, s.z - z) < 6)) {
              spots.push({
                x, z, y: terrain.heightAt(x, z), yaw: Math.atan2(-tz, tx) + (r() < 0.5 ? Math.PI : 0),
                hp: 140, dead: false, color: new THREE.Color(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)]), anim: 0, roll: 0,
              });
            }
          }
          d += 9 + r() * 22;
        }
      }
    }
    const n = Math.max(1, spots.length);
    this.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(4.5, 0.75, 1.95).translate(0, 0.72, 0), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }), n);
    this.cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.62, 1.75).translate(-0.25, 1.4, 0), new THREE.MeshStandardMaterial({ color: "#1a2430", roughness: 0.1, metalness: 0.8 }), n);
    this.chassis = new THREE.InstancedMesh(new THREE.BoxGeometry(4.0, 0.5, 2.0).translate(0, 0.32, 0), new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.9 }), n);
    spots.forEach((s, index) => {
      const car: Car = { ...s, index };
      this.cars.push(car);
      this.bodies.setColorAt(index, car.color);
      collision.addCircle({ x: s.x + Math.cos(s.yaw) * 1.2, z: s.z - Math.sin(s.yaw) * 1.2, r: 1.05, top: s.y + 1.7 });
      collision.addCircle({ x: s.x - Math.cos(s.yaw) * 1.2, z: s.z + Math.sin(s.yaw) * 1.2, r: 1.05, top: s.y + 1.7 });
      this.writeMatrix(car);
    });
    this.bodies.count = this.cabins.count = this.chassis.count = spots.length;
    for (const mesh of [this.bodies, this.cabins, this.chassis]) {
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
  }

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  private writeMatrix(car: Car) {
    const lift = car.anim > 0 ? Math.sin(Math.min(1, car.anim) * Math.PI) * 4 : 0;
    this.e.set(car.roll * 0.6, car.yaw, car.roll, "YXZ");
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(car.x, car.y + lift, car.z), this.q, new THREE.Vector3(1, 1, 1));
    this.bodies.setMatrixAt(car.index, this.m);
    this.cabins.setMatrixAt(car.index, this.m);
    this.chassis.setMatrixAt(car.index, this.m);
    this.bodies.instanceMatrix.needsUpdate = this.cabins.instanceMatrix.needsUpdate = this.chassis.instanceMatrix.needsUpdate = true;
  }

  /** Ray vs oriented car boxes. Returns nearest hit. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { car: Car; dist: number } | null {
    let best: { car: Car; dist: number } | null = null;
    const H = CarSystem.HALF;
    for (const car of this.cars) {
      const ox = origin.x - car.x, oz = origin.z - car.z;
      if (ox * ox + oz * oz > (maxDist + 4) ** 2) continue;
      const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
      // world -> local (rotate by -yaw around Y)
      const lox = ox * c - oz * s, loz = ox * s + oz * c, loy = origin.y - (car.y + 0.95);
      const ldx = dir.x * c - dir.z * s, ldz = dir.x * s + dir.z * c, ldy = dir.y;
      let tmin = 0, tmax = maxDist;
      const slab = (o: number, d: number, h: number) => {
        if (Math.abs(d) < 1e-6) return o >= -h && o <= h;
        let t1 = (-h - o) / d, t2 = (h - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        return tmin <= tmax;
      };
      if (slab(lox, ldx, H.x) && slab(loy, ldy, H.y) && slab(loz, ldz, H.z) && (!best || tmin < best.dist)) {
        best = { car, dist: tmin };
      }
    }
    return best;
  }

  damage(car: Car, amount: number): boolean {
    if (car.dead) return false;
    car.hp -= amount;
    if (car.hp > 0) {
      this.bodies.setColorAt(car.index, car.color.clone().lerp(new THREE.Color("#222"), 1 - car.hp / 140));
      this.bodies.instanceColor!.needsUpdate = true;
      return false;
    }
    car.dead = true;
    car.anim = 0.0001;
    this.bodies.setColorAt(car.index, new THREE.Color("#141210"));
    this.bodies.instanceColor!.needsUpdate = true;
    return true;
  }

  update(dt: number) {
    for (const car of this.cars) {
      if (car.anim <= 0 || car.anim >= 1) continue;
      car.anim = Math.min(1, car.anim + dt * 1.3);
      car.roll = Math.min(0.5, car.anim * 0.9);
      car.y = this.terrain.heightAt(car.x, car.z);
      this.writeMatrix(car);
    }
  }
}
