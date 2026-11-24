import { roundMm, type PointMm } from "../geometry";
import type { Opening, Wall } from "../project";

export interface RoutingOptions {
  /** Розмір клітинки сітки, мм. */
  cellMm: number;
  /** Відстань траси від стін, мм (за методикою — 20 см). */
  clearanceMm: number;
  /** Штраф за поворот у «клітинках»: чим більше, тим менше поворотів у трасі. */
  turnPenaltyCells: number;
  /** Верхня межа кількості клітинок сітки (захист від надвеликих областей). */
  maxCells: number;
  /** Радіус пошуку вільної клітинки поблизу точки, що потрапила на стіну, мм. */
  snapRadiusMm: number;
}

export const DEFAULT_ROUTING_OPTIONS: RoutingOptions = {
  cellMm: 100,
  clearanceMm: 200,
  turnPenaltyCells: 4,
  maxCells: 3_000_000,
  snapRadiusMm: 3000,
};

export interface Bounds {
  minXMm: number;
  minYMm: number;
  maxXMm: number;
  maxYMm: number;
}

export interface GridRoute {
  /** Ламана траси від `from` до `to` (лише горизонтальні й вертикальні ланки), цілі мм. */
  path: PointMm[];
  /** Довжина ламаної, мм. */
  lengthMm: number;
}

const STEP_COST = 10;
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const NO_DIR = 4;

/** Мінімальна бінарна купа (ключ, значення). */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, val: number): void {
    const keys = this.keys;
    const vals = this.vals;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((keys[parent] as number) <= key) break;
      keys[i] = keys[parent] as number;
      vals[i] = vals[parent] as number;
      i = parent;
    }
    keys[i] = key;
    vals[i] = val;
  }

  pop(): { key: number; val: number } {
    const keys = this.keys;
    const vals = this.vals;
    const topKey = keys[0] as number;
    const topVal = vals[0] as number;
    const lastKey = keys.pop() as number;
    const lastVal = vals.pop() as number;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && (keys[child + 1] as number) < (keys[child] as number)) child++;
        if ((keys[child] as number) >= lastKey) break;
        keys[i] = keys[child] as number;
        vals[i] = vals[child] as number;
        i = child;
      }
      keys[i] = lastKey;
      vals[i] = lastVal;
    }
    return { key: topKey, val: topVal };
  }
}

/**
 * Растрова сітка області поверху. Стіни (з відступом clearance) — перешкоди;
 * двері «пробивають» стіну коридором (з відступом від одвірків), вікна лишаються стіною.
 */
export class RoutingGrid {
  readonly cols: number;
  readonly rows: number;
  readonly originXMm: number;
  readonly originYMm: number;
  readonly cellMm: number;
  private readonly blocked: Uint8Array;
  private readonly options: RoutingOptions;

  constructor(
    bounds: Bounds,
    walls: readonly Wall[],
    openings: readonly Opening[],
    options: RoutingOptions = DEFAULT_ROUTING_OPTIONS,
  ) {
    this.options = options;
    this.cellMm = options.cellMm;
    // Центри клітинок припадають на кратні cellMm, тож точки, прив'язані до сітки редактора
    // (крок 100 мм), лежать точно в центрах клітинок і не дають похибки квантування.
    this.originXMm = Math.floor(bounds.minXMm / options.cellMm) * options.cellMm - options.cellMm / 2;
    this.originYMm = Math.floor(bounds.minYMm / options.cellMm) * options.cellMm - options.cellMm / 2;
    this.cols = Math.max(1, Math.ceil((bounds.maxXMm - this.originXMm) / options.cellMm));
    this.rows = Math.max(1, Math.ceil((bounds.maxYMm - this.originYMm) / options.cellMm));
    if (this.cols * this.rows > options.maxCells) {
      throw new Error(
        `Область трасування завелика (${this.cols}×${this.rows} клітинок). Зменште область або збільште крок сітки.`,
      );
    }
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.rasterize(walls, openings);
  }

  private centerX(ix: number): number {
    return this.originXMm + (ix + 0.5) * this.cellMm;
  }

  private centerY(iy: number): number {
    return this.originYMm + (iy + 0.5) * this.cellMm;
  }

  private rasterize(walls: readonly Wall[], openings: readonly Opening[]): void {
    const { clearanceMm, cellMm } = this.options;

    for (const wall of walls) {
      const ax = wall.start.xMm;
      const ay = wall.start.yMm;
      const dx = wall.end.xMm - ax;
      const dy = wall.end.yMm - ay;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const ux = dx / length;
      const uy = dy / length;
      const nx = -uy;
      const ny = ux;
      const half = wall.thicknessMm / 2 + clearanceMm;
      const ext = wall.thicknessMm / 2;

      // Коридори дверей цієї стіни: проміжки вздовж стіни, де вона прохідна.
      const corridors: [number, number][] = [];
      for (const o of openings) {
        if (o.wallId !== wall.id || o.kind !== "door") continue;
        const margin = Math.min(clearanceMm, Math.max(0, (o.widthMm - cellMm) / 2));
        corridors.push([o.offsetMm + margin, o.offsetMm + o.widthMm - margin]);
      }

      const corners = [
        [ax - ux * ext + nx * half, ay - uy * ext + ny * half],
        [ax - ux * ext - nx * half, ay - uy * ext - ny * half],
        [ax + dx + ux * ext + nx * half, ay + dy + uy * ext + ny * half],
        [ax + dx + ux * ext - nx * half, ay + dy + uy * ext - ny * half],
      ] as const;
      const minX = Math.min(...corners.map((c) => c[0]));
      const maxX = Math.max(...corners.map((c) => c[0]));
      const minY = Math.min(...corners.map((c) => c[1]));
      const maxY = Math.max(...corners.map((c) => c[1]));

      const ix0 = Math.max(0, Math.floor((minX - this.originXMm) / cellMm));
      const ix1 = Math.min(this.cols - 1, Math.floor((maxX - this.originXMm) / cellMm));
      const iy0 = Math.max(0, Math.floor((minY - this.originYMm) / cellMm));
      const iy1 = Math.min(this.rows - 1, Math.floor((maxY - this.originYMm) / cellMm));

      for (let iy = iy0; iy <= iy1; iy++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const px = this.centerX(ix) - ax;
          const py = this.centerY(iy) - ay;
          const s = px * ux + py * uy;
          const d = px * nx + py * ny;
          if (s < -ext || s > length + ext || Math.abs(d) > half) continue;
          if (corridors.some(([s0, s1]) => s >= s0 && s <= s1)) continue;
          this.blocked[iy * this.cols + ix] = 1;
        }
      }
    }
  }

  isFree(ix: number, iy: number): boolean {
    return ix >= 0 && iy >= 0 && ix < this.cols && iy < this.rows && this.blocked[iy * this.cols + ix] === 0;
  }

  /** Індекси клітинки, що містить точку (можуть виходити за межі сітки). */
  cellOf(p: PointMm): { ix: number; iy: number } {
    return {
      ix: Math.floor((p.xMm - this.originXMm) / this.cellMm),
      iy: Math.floor((p.yMm - this.originYMm) / this.cellMm),
    };
  }

  /** Найближча вільна клітинка до (ix, iy) у межах snapRadiusMm. */
  nearestFree(ix: number, iy: number): { ix: number; iy: number } | undefined {
    const maxR = Math.ceil(this.options.snapRadiusMm / this.cellMm);
    let best: { ix: number; iy: number } | undefined;
    let bestDist = Infinity;
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.isFree(ix + dx, iy + dy)) continue;
          const dist = Math.hypot(dx, dy);
          if (dist < bestDist) {
            bestDist = dist;
            best = { ix: ix + dx, iy: iy + dy };
          }
        }
      }
      if (best && bestDist <= r) break;
    }
    return best;
  }

  /**
   * Ортогональний маршрут між двома точками з мінімальною довжиною та штрафом за повороти.
   * Якщо точка потрапила на стіну (або в зону відступу), траса починається з найближчої вільної клітинки.
   * Повертає undefined, якщо шляху немає (наприклад, кімната без дверей).
   */
  route(from: PointMm, to: PointMm): GridRoute | undefined {
    const a = this.cellOf(from);
    const b = this.cellOf(to);
    const start = this.nearestFree(a.ix, a.iy);
    const goal = this.nearestFree(b.ix, b.iy);
    if (!start || !goal) return undefined;

    const cells = this.search(start.ix, start.iy, goal.ix, goal.iy);
    if (!cells) return undefined;

    const startX = this.centerX(start.ix);
    const endY = this.centerY(goal.iy);

    // Від точки до першої клітинки й від останньої до точки — «Г»-подібні ортогональні з'єднання.
    const raw: PointMm[] = [
      from,
      { xMm: startX, yMm: from.yMm },
      ...cells.map(([ix, iy]) => ({ xMm: this.centerX(ix), yMm: this.centerY(iy) })),
      { xMm: to.xMm, yMm: endY },
      to,
    ];
    return finalizeRoute(raw);
  }

  private search(sx: number, sy: number, gx: number, gy: number): [number, number][] | undefined {
    const { cols, rows } = this;
    const turnCost = this.options.turnPenaltyCells * STEP_COST;
    const stateCount = cols * rows * 5;
    const g = new Int32Array(stateCount).fill(0x7fffffff);
    const parent = new Int32Array(stateCount).fill(-1);
    const heuristic = (ix: number, iy: number) => (Math.abs(ix - gx) + Math.abs(iy - gy)) * STEP_COST;

    const startState = (sy * cols + sx) * 5 + NO_DIR;
    g[startState] = 0;
    const heap = new MinHeap();
    heap.push(heuristic(sx, sy), startState);

    while (heap.size > 0) {
      const { key, val: state } = heap.pop();
      const cell = Math.floor(state / 5);
      const dir = state - cell * 5;
      const ix = cell % cols;
      const iy = (cell - ix) / cols;
      if (key > (g[state] as number) + heuristic(ix, iy)) continue; // застарілий запис

      if (ix === gx && iy === gy) {
        const result: [number, number][] = [];
        for (let s = state; s !== -1; s = parent[s] as number) {
          const c = Math.floor(s / 5);
          const cx = c % cols;
          result.push([cx, (c - cx) / cols]);
        }
        return result.reverse();
      }

      for (let nd = 0; nd < 4; nd++) {
        const [ddx, ddy] = DIRS[nd] as readonly [number, number];
        const nx = ix + ddx;
        const ny = iy + ddy;
        if (!this.isFree(nx, ny)) continue;
        const cost = STEP_COST + (dir !== NO_DIR && dir !== nd ? turnCost : 0);
        const next = (ny * cols + nx) * 5 + nd;
        const ng = (g[state] as number) + cost;
        if (ng < (g[next] as number)) {
          g[next] = ng;
          parent[next] = state;
          heap.push(ng + heuristic(nx, ny), next);
        }
      }
    }
    return undefined;
  }
}

/** Округлює, прибирає дублікати й проміжні точки на прямих; рахує довжину. */
function finalizeRoute(raw: readonly PointMm[]): GridRoute {
  const rounded = raw.map((p) => ({ xMm: roundMm(p.xMm), yMm: roundMm(p.yMm) }));
  const dedup: PointMm[] = [];
  for (const p of rounded) {
    const last = dedup[dedup.length - 1];
    if (!last || last.xMm !== p.xMm || last.yMm !== p.yMm) dedup.push(p);
  }
  const path: PointMm[] = [];
  for (const p of dedup) {
    while (path.length >= 2) {
      const a = path[path.length - 2] as PointMm;
      const b = path[path.length - 1] as PointMm;
      const colinear =
        (a.xMm === b.xMm && b.xMm === p.xMm) || (a.yMm === b.yMm && b.yMm === p.yMm);
      if (!colinear) break;
      path.pop();
    }
    path.push(p);
  }
  let lengthMm = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as PointMm;
    const b = path[i] as PointMm;
    lengthMm += Math.abs(b.xMm - a.xMm) + Math.abs(b.yMm - a.yMm);
  }
  return { path, lengthMm };
}
