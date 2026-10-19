import * as THREE from "three";
import { PolygonGrid, distToSegment, pointInPolygon } from "../../../shared/geometry.ts";
import type { Vec2 } from "../../../shared/types.ts";
import type { Terrain } from "./terrain.ts";

export interface BuildingCollider {
  poly: Vec2[];
  base: number;
  top: number;
  floor?: number;
  hollow?: boolean;
  door?: { ax: number; az: number; bx: number; bz: number; t0: number; t1: number; height: number };
}

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
  top: number;
}

/** Horizontal collision against building footprints and round props, vertical against terrain and roofs. */
export class CollisionWorld {
  private buildingGrid: PolygonGrid<BuildingCollider>;
  private circles = new Map<number, CircleCollider[]>();
  private readonly cell = 8;

  constructor(readonly terrain: Terrain, buildings: BuildingCollider[]) {
    this.buildingGrid = new PolygonGrid(buildings, 16);
  }

  private key(cx: number, cz: number) {
    return ((cx + 32768) << 16) | (cz + 32768);
  }

  addCircle(c: CircleCollider) {
    const cx = Math.floor(c.x / this.cell), cz = Math.floor(c.z / this.cell);
    const k = this.key(cx, cz);
    let list = this.circles.get(k);
    if (!list) this.circles.set(k, (list = []));
    list.push(c);
  }

  private nearbyBuildings(x: number, z: number, r: number): BuildingCollider[] {
    const set = new Set<BuildingCollider>();
    for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]]) {
      for (const b of this.buildingGrid.near(x + ox, z + oz)) set.add(b);
    }
    return [...set];
  }

  buildingAt(x: number, z: number): BuildingCollider | null {
    return this.buildingGrid.hit(x, z);
  }

  /** True if a ground agent should treat this cell as a wall. Interiors of hollow buildings stay open. */
  blocksWalk(x: number, z: number): boolean {
    const b = this.buildingGrid.hit(x, z);
    if (!b) return false;
    if (!b.hollow) return true;
    const poly = b.poly;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const d = distToSegment(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
      if (d.dist < 0.55 && !this.doorGap(b, poly[j][0], poly[j][1], poly[i][0], poly[i][1], d.t, (b.floor ?? b.base) + 1)) return true;
    }
    return false;
  }

  /** Highest walkable surface under (x,z) that the feet can reach from feetY. */
  groundAt(x: number, z: number, feetY = Infinity): number {
    let g = this.terrain.heightAt(x, z);
    const b = this.buildingGrid.hit(x, z);
    if (!b) return g;
    if (b.hollow) {
      const floor = b.floor ?? g;
      if (feetY >= b.top - 0.7) return Math.max(g, b.top);
      if (feetY >= floor - 0.4) return Math.max(g, floor);
      return g;
    }
    if (feetY >= b.top - 0.75) g = Math.max(g, b.top);
    return g;
  }

  /** Pushes `pos` (feet position) out of solids. Returns true if anything was hit. */
  resolve(pos: THREE.Vector3, radius: number, height = 1.8): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.nearbyBuildings(pos.x, pos.z, radius)) {
        if (pos.y >= b.top - 0.75 || pos.y + height < b.base) continue;
        const poly = b.poly;
        if (b.hollow) {
          const thick = 0.28 + radius;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const ax = poly[j][0], az = poly[j][1], bx = poly[i][0], bz = poly[i][1];
            const d = distToSegment(pos.x, pos.z, ax, az, bx, bz);
            if (d.dist >= thick) continue;
            if (this.doorGap(b, ax, az, bx, bz, d.t, pos.y)) continue;
            const nx = pos.x - d.cx, nz = pos.z - d.cz;
            const len = Math.hypot(nx, nz) || 1;
            const push = thick - d.dist;
            pos.x += (nx / len) * push;
            pos.z += (nz / len) * push;
            moved = hit = true;
          }
          continue;
        }
        const inside = pointInPolygon(pos.x, pos.z, poly);
        let best = { dist: Infinity, cx: 0, cz: 0 };
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const d = distToSegment(pos.x, pos.z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
          if (d.dist < best.dist) best = d;
        }
        if (inside || best.dist < radius) {
          let nx = pos.x - best.cx, nz = pos.z - best.cz;
          const len = Math.hypot(nx, nz) || 1;
          nx /= len;
          nz /= len;
          if (inside) {
            nx = -nx;
            nz = -nz;
          }
          const push = inside ? best.dist + radius : radius - best.dist;
          pos.x += nx * push;
          pos.z += nz * push;
          moved = hit = true;
        }
      }
      const cx = Math.floor(pos.x / this.cell), cz = Math.floor(pos.z / this.cell);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          for (const c of this.circles.get(this.key(ix, iz)) ?? []) {
            if (pos.y > c.top) continue;
            const dx = pos.x - c.x, dz = pos.z - c.z;
            const d = Math.hypot(dx, dz);
            const min = c.r + radius;
            if (d < min && d > 1e-4) {
              pos.x += (dx / d) * (min - d);
              pos.z += (dz / d) * (min - d);
              moved = hit = true;
            }
          }
        }
      }
      if (!moved) break;
    }
    const lim = this.terrain.half - 2;
    pos.x = THREE.MathUtils.clamp(pos.x, -lim, lim);
    pos.z = THREE.MathUtils.clamp(pos.z, -lim, lim);
    return hit;
  }

  /** Coarse line-of-sight test against building footprints (2D, ignores roofs below the line). */
  lineBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist / 3);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
      if (this.terrain.heightAt(x, z) > y + 0.3) return true;
      const b = this.buildingGrid.hit(x, z);
      if (!b || y >= b.top) continue;
      if (!b.hollow) return true;
      const thick = 0.32;
      const poly = b.poly;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const d = distToSegment(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
        if (d.dist < thick && !this.doorGap(b, poly[j][0], poly[j][1], poly[i][0], poly[i][1], d.t, y)) return true;
      }
    }
    return false;
  }

  private doorGap(b: BuildingCollider, ax: number, az: number, bx: number, bz: number, t: number, y: number) {
    const d = b.door;
    if (!d || y > (b.floor ?? b.base) + d.height) return false;
    const same =
      (Math.hypot(ax - d.ax, az - d.az) < 0.05 && Math.hypot(bx - d.bx, bz - d.bz) < 0.05) ||
      (Math.hypot(ax - d.bx, az - d.bz) < 0.05 && Math.hypot(bx - d.ax, bz - d.az) < 0.05);
    if (!same) return false;
    const u = Math.hypot(ax - d.ax, az - d.az) < 0.05 ? t : 1 - t;
    return u > d.t0 && u < d.t1;
  }
}
