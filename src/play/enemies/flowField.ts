import type { CollisionWorld } from "../world/collision.ts";

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Dijkstra distance field outward from the player over a coarse walkability grid.
 * Goblins descend the gradient, which routes them around buildings instead of into walls.
 */
export class FlowField {
  private readonly n: number;
  private readonly half: number;
  private readonly blocked: Uint8Array;
  private readonly dist: Float32Array;
  private readonly heap: Int32Array;
  private originCell = -1;
  private age = Infinity;

  constructor(collision: CollisionWorld, size: number, private readonly cell = 2.5) {
    this.n = Math.ceil(size / cell) + 1;
    this.half = (this.n * cell) / 2;
    const total = this.n * this.n;
    this.blocked = new Uint8Array(total);
    this.dist = new Float32Array(total).fill(Infinity);
    this.heap = new Int32Array(total * 10);
    const r = cell * 0.45;
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = (i + 0.5) * cell - this.half, z = (j + 0.5) * cell - this.half;
        if (
          collision.blocksWalk(x, z) || collision.blocksWalk(x + r, z) || collision.blocksWalk(x - r, z) ||
          collision.blocksWalk(x, z + r) || collision.blocksWalk(x, z - r)
        ) this.blocked[j * this.n + i] = 1;
      }
    }
  }

  private index(x: number, z: number) {
    const i = Math.floor((x + this.half) / this.cell), j = Math.floor((z + this.half) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }

  update(dt: number, px: number, pz: number) {
    this.age += dt;
    const c = this.index(px, pz);
    if (c < 0 || (c === this.originCell && this.age < 2) || this.age < 0.35) return;
    this.originCell = c;
    this.age = 0;
    this.solve(c);
  }

  private solve(start: number) {
    const { n, dist, blocked, heap } = this;
    dist.fill(Infinity);
    dist[start] = 0;
    // binary heap of (cost, cell) packed as two int32 slots; costs scaled to int
    let size = 0;
    const push = (cost: number, cell: number) => {
      let k = size++;
      heap[k * 2] = cost; heap[k * 2 + 1] = cell;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p * 2] <= heap[k * 2]) break;
        const tc = heap[p * 2], tn = heap[p * 2 + 1];
        heap[p * 2] = heap[k * 2]; heap[p * 2 + 1] = heap[k * 2 + 1];
        heap[k * 2] = tc; heap[k * 2 + 1] = tn;
        k = p;
      }
    };
    const pop = () => {
      const cell = heap[1];
      size--;
      heap[0] = heap[size * 2]; heap[1] = heap[size * 2 + 1];
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < size && heap[l * 2] < heap[m * 2]) m = l;
        if (r < size && heap[r * 2] < heap[m * 2]) m = r;
        if (m === k) break;
        const tc = heap[m * 2], tn = heap[m * 2 + 1];
        heap[m * 2] = heap[k * 2]; heap[m * 2 + 1] = heap[k * 2 + 1];
        heap[k * 2] = tc; heap[k * 2 + 1] = tn;
        k = m;
      }
      return cell;
    };
    push(0, start);
    while (size > 0 && size < heap.length / 2 - 8) {
      const c = pop();
      const ci = c % n, cj = (c - ci) / n;
      const dc = dist[c];
      for (const [di, dj, w] of DIRS) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const nc = j * n + i;
        if (blocked[nc]) continue;
        if (di && dj && (blocked[cj * n + i] || blocked[j * n + ci])) continue;
        const nd = dc + w;
        if (nd < dist[nc]) {
          dist[nc] = nd;
          push(Math.round(nd * 100), nc);
        }
      }
    }
  }

  /** Unit direction toward the player along the field, or null if the field has nothing useful here. */
  direction(x: number, z: number): [number, number] | null {
    const c = this.index(x, z);
    if (c < 0) return null;
    const { n, dist, blocked } = this;
    const ci = c % n, cj = (c - ci) / n;
    let best = blocked[c] ? Infinity : dist[c];
    let bx = 0, bz = 0;
    for (const [di, dj] of DIRS) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const nc = j * n + i;
      if (blocked[nc]) continue;
      if (dist[nc] < best) { best = dist[nc]; bx = di; bz = dj; }
    }
    if (bx === 0 && bz === 0) return null;
    // aim at the neighbor's centre so agents re-centre in corridors
    const tx = (ci + bx + 0.5) * this.cell - this.half - x;
    const tz = (cj + bz + 0.5) * this.cell - this.half - z;
    const l = Math.hypot(tx, tz) || 1;
    return [tx / l, tz / l];
  }
}
