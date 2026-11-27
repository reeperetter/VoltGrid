import type { PlanElement } from "./elements";
import type { Barrier, RegionMask } from "./regions";
import { CONDUIT_FILL, DEFAULT_BOARD, pickConduit, type BoardCircuit } from "./board";

export interface ApartmentRoutingOptions {
  /** Мінімальна відстань траси від стіни, мм. */
  minWallDistMm: number;
  /** Відступ від стін біля вікон (можливі радіатори), мм. */
  radiatorClearanceMm: number;
  /** Зона біля вікна, де діє відступ, мм. */
  windowZoneMm: number;
  drillMaxThicknessMm: number;
  /** Додаткова «ціна» проходу крізь стіну, в клітинках. */
  drillPenaltyCells: number;
  turnPenaltyCells: number;
  /** Висоти кріплення, мм (від підлоги). */
  heightsMm: { socket: number; switch: number; light: number; board: number; data: number };
  /** Технічний запас на підлозі + запас на підключення, мм (150 + 200). */
  endAllowanceMm: number;
  bendAllowanceMm: number;
  /** Запас на всю довжину, наприклад 0.10 = +10 %. */
  reserve: number;
}

export const DEFAULT_APARTMENT_ROUTING: ApartmentRoutingOptions = {
  minWallDistMm: 100,
  radiatorClearanceMm: 200,
  windowZoneMm: 1500,
  drillMaxThicknessMm: 140,
  drillPenaltyCells: 6,
  turnPenaltyCells: 2,
  heightsMm: { socket: 300, switch: 1000, light: 2700, board: 2400, data: 300 },
  endAllowanceMm: 350,
  bendAllowanceMm: 200,
  reserve: 0.1,
};

export interface RouteLeg {
  /** Ключ траси: номер кола («1»…«9») або «TT» для слабкострумки від TSM. */
  circuit: string;
  fromId: string;
  toId: string;
  path: { x: number; y: number }[];
  horizontalMm: number;
  bends: number;
  drills: number;
  /** Довжина з вертикалями, вигинами й запасом, мм. */
  lengthMm: number;
  /** Діаметр труби fi20/25/32 за заповненням (кабелі інших кіл у тих самих клітинках враховано). */
  conduit: 20 | 25 | 32;
}

export interface ApartmentRoutes {
  legs: RouteLeg[];
  byCircuit: Record<string, { lengthMm: number; horizontalMm: number; legs: number }>;
  totalMm: number;
  unreached: string[];
  /** Довжина труби (горизонталь по трасі), мм, за діаметрами. */
  byConduit: Record<20 | 25 | 32, number>;
  /** Зауваження щодо відповідності плану схемі щита. */
  boardNotes: string[];
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(k: number, v: number) {
    const ks = this.keys;
    const vs = this.vals;
    let i = ks.length;
    ks.push(k);
    vs.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (ks[p]! <= k) break;
      ks[i] = ks[p]!;
      vs[i] = vs[p]!;
      i = p;
    }
    ks[i] = k;
    vs[i] = v;
  }
  pop(): number {
    const ks = this.keys;
    const vs = this.vals;
    const top = vs[0]!;
    const lk = ks.pop()!;
    const lv = vs.pop()!;
    const n = ks.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && ks[c + 1]! < ks[c]!) c++;
        if (ks[c]! >= lk) break;
        ks[i] = ks[c]!;
        vs[i] = vs[c]!;
        i = c;
      }
      ks[i] = lk;
      vs[i] = lv;
    }
    return top;
  }
}

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

function heightOf(el: PlanElement, o: ApartmentRoutingOptions): number {
  switch (el.kind) {
    case "switchSingle":
    case "switchDouble":
      return o.heightsMm.switch;
    case "lightOutlet":
      return el.wall ? o.heightsMm.switch + 1000 : o.heightsMm.light;
    case "tm":
      return o.heightsMm.board;
    case "tsm":
    case "it":
    case "rtv":
      return o.heightsMm.data;
    default:
      return o.heightsMm.socket;
  }
}

/** Трасування кабель-каналів у квартирі: від TM ланцюжком по точках кожного кола; крізь тонкі стіни — свердлінням. */
export function routeApartment(
  mask: RegionMask,
  elements: readonly PlanElement[],
  windows: readonly Barrier[],
  options: Partial<ApartmentRoutingOptions> = {},
  board: readonly BoardCircuit[] = DEFAULT_BOARD,
): ApartmentRoutes {
  const o = { ...DEFAULT_APARTMENT_ROUTING, ...options, heightsMm: { ...DEFAULT_APARTMENT_ROUTING.heightsMm, ...options.heightsMm } };
  const { w, h, data, cellMm: C } = mask;
  const N = w * h;
  const cellOf = (x: number, y: number) => ({ i: Math.floor((x - mask.x0) / C), j: Math.floor((y - mask.y0) / C) });
  const center = (i: number, j: number) => ({ x: mask.x0 + (i + 0.5) * C, y: mask.y0 + (j + 0.5) * C });

  // Відстань до найближчої стіни (в клітинках) — багатоджерельний BFS.
  const dist = new Int16Array(N).fill(-1);
  const queue: number[] = [];
  for (let c = 0; c < N; c++) {
    if (data[c] !== 1) {
      dist[c] = 0;
      queue.push(c);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q]!;
    const ci = c % w;
    const cj = (c - ci) / w;
    for (const [di, dj] of DIRS) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const n = j * w + i;
      if (dist[n] === -1) {
        dist[n] = dist[c]! + 1;
        queue.push(n);
      }
    }
  }

  // Клітинки поблизу вікон — там можливі радіатори, тож тримаємось далі від стіни.
  const nearWindow = new Uint8Array(N);
  const zone = Math.ceil(o.windowZoneMm / C);
  for (const win of windows) {
    const len = Math.hypot(win.x2 - win.x1, win.y2 - win.y1);
    const steps = Math.max(1, Math.ceil(len / C));
    for (let s = 0; s <= steps; s++) {
      const { i: wi, j: wj } = cellOf(win.x1 + ((win.x2 - win.x1) * s) / steps, win.y1 + ((win.y2 - win.y1) * s) / steps);
      for (let a = -zone; a <= zone; a++) {
        for (let b = -zone; b <= zone; b++) {
          if (a * a + b * b > zone * zone) continue;
          const i = wi + a;
          const j = wj + b;
          if (i >= 0 && j >= 0 && i < w && j < h) nearWindow[j * w + i] = 1;
        }
      }
    }
  }

  const minD = Math.max(1, Math.ceil(o.minWallDistMm / C));
  const radD = Math.ceil(o.radiatorClearanceMm / C);
  const drillCells = Math.ceil(o.drillMaxThicknessMm / C);
  const cost = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    if (data[c] !== 1) continue;
    let k = 1;
    const d = dist[c]!;
    if (d < minD) k += 8; // впритул до стіни — небажано
    if (nearWindow[c] && d < radD) k += 3; // біля вікна — відступ під радіатор
    cost[c] = k;
  }

  const snap = (x: number, y: number): number | undefined => {
    const { i, j } = cellOf(x, y);
    let best: number | undefined;
    let bestD = Infinity;
    const r = Math.ceil(600 / C);
    for (let a = -r; a <= r; a++) {
      for (let b = -r; b <= r; b++) {
        const ii = i + a;
        const jj = j + b;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const c = jj * w + ii;
        if (data[c] !== 1) continue;
        const d = a * a + b * b + (dist[c]! < minD ? 40 : 0);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  };

  interface Found {
    path: { x: number; y: number }[];
    bends: number;
    drills: number;
  }
  const astar = (from: number, to: number): Found | undefined => {
    const S = N * 4;
    const g = new Float32Array(S).fill(Infinity);
    const prev = new Int32Array(S).fill(-1);
    const jump = new Uint8Array(S);
    const heap = new MinHeap();
    const ti = to % w;
    const tj = (to - ti) / w;
    const hfn = (c: number) => {
      const ci = c % w;
      return Math.abs(ci - ti) + Math.abs((c - ci) / w - tj);
    };
    for (let d = 0; d < 4; d++) {
      g[from * 4 + d] = 0;
      heap.push(hfn(from), from * 4 + d);
    }
    let goal = -1;
    while (heap.size > 0) {
      const st = heap.pop();
      const c = st >> 2;
      const dir = st & 3;
      if (c === to) {
        goal = st;
        break;
      }
      const gc = g[st]!;
      const ci = c % w;
      const cj = (c - ci) / w;
      const f = gc + hfn(c);
      void f;
      for (let nd = 0; nd < 4; nd++) {
        const [di, dj] = DIRS[nd]!;
        let steps = 1;
        let ni = ci + di;
        let nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        let n = nj * w + ni;
        let extra = 0;
        let drilled = 0;
        if (data[n] === 2) {
          // Стіна: дозволено лише тонку (≤ drillMax) і лише якщо за нею вільна клітинка нашої квартири.
          let k = 1;
          while (k <= drillCells && data[(cj + dj * (k + 1)) * w + ci + di * (k + 1)] === 2) k++;
          const ti2 = ci + di * (k + 1);
          const tj2 = cj + dj * (k + 1);
          if (k > drillCells || ti2 < 0 || tj2 < 0 || ti2 >= w || tj2 >= h || data[tj2 * w + ti2] !== 1) continue;
          steps = k + 1;
          ni = ti2;
          nj = tj2;
          n = nj * w + ni;
          extra = o.drillPenaltyCells + k;
          drilled = 1;
        } else if (data[n] !== 1) {
          continue;
        }
        const turn = nd !== dir ? o.turnPenaltyCells : 0;
        const ng = gc + steps * cost[n]! + extra + turn;
        const ns = n * 4 + nd;
        if (ng < g[ns]!) {
          g[ns] = ng;
          prev[ns] = st;
          jump[ns] = drilled;
          heap.push(ng + hfn(n), ns);
        }
      }
    }
    if (goal < 0) return undefined;
    const cells: { c: number; drill: boolean }[] = [];
    for (let st = goal; st !== -1; st = prev[st]!) cells.push({ c: st >> 2, drill: jump[st] === 1 });
    cells.reverse();
    const pts: { x: number; y: number }[] = [];
    let drills = 0;
    for (const { c, drill } of cells) {
      const i = c % w;
      pts.push(center(i, (c - i) / w));
      if (drill) drills++;
    }
    // Спрощення: прибираємо проміжні точки на прямих, рахуємо повороти.
    const simp: { x: number; y: number }[] = [];
    let bends = 0;
    for (const p of pts) {
      const n = simp.length;
      if (n >= 2) {
        const a = simp[n - 2]!;
        const b = simp[n - 1]!;
        const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
        if (Math.abs(cross) < 1e-6) {
          simp[n - 1] = p;
          continue;
        }
        bends++;
      }
      simp.push(p);
    }
    return { path: simp, bends, drills };
  };

  // Групування точок за колами.
  const tm = elements.find((e) => e.kind === "tm");
  const tsm = elements.find((e) => e.kind === "tsm");
  const groups = new Map<string, PlanElement[]>();
  const add = (key: string, el: PlanElement) => {
    const g = groups.get(key);
    if (g) g.push(el);
    else groups.set(key, [el]);
  };
  for (const e of elements) {
    if (e.kind === "socketSingle" || e.kind === "socketDouble" || e.kind === "cooker3f") add(String(e.circuit ?? 0), e);
    else if (e.kind === "lightOutlet" || e.kind === "switchSingle" || e.kind === "switchDouble") add("1", e);
    else if (e.kind === "it" || e.kind === "rtv") add("TT", e);
  }

  const legs: RouteLeg[] = [];
  const unreached: string[] = [];
  const route = (circuit: string, a: PlanElement, b: PlanElement) => {
    const ca = snap(a.x, a.y);
    const cb = snap(b.x, b.y);
    if (ca === undefined || cb === undefined) {
      unreached.push(`${circuit}: ${b.id}`);
      return false;
    }
    const f = ca === cb ? { path: [center(ca % w, (ca - (ca % w)) / w)], bends: 0, drills: 0 } : astar(ca, cb);
    if (!f) {
      unreached.push(`${circuit}: ${b.id}`);
      return false;
    }
    let horizontal = 0;
    for (let i = 1; i < f.path.length; i++) {
      horizontal += Math.hypot(f.path[i]!.x - f.path[i - 1]!.x, f.path[i]!.y - f.path[i - 1]!.y);
    }
    const vertical = heightOf(a, o) + heightOf(b, o) + 2 * o.endAllowanceMm;
    const length = (horizontal + vertical + f.bends * o.bendAllowanceMm) * (1 + o.reserve);
    legs.push({
      circuit,
      fromId: a.id,
      toId: b.id,
      path: f.path,
      horizontalMm: horizontal,
      bends: f.bends,
      drills: f.drills,
      lengthMm: length,
      conduit: 20,
    });
    return true;
  };

  for (const [circuit, pts] of [...groups.entries()].sort()) {
    const start = circuit === "TT" ? tsm : tm;
    if (!start) {
      unreached.push(`${circuit}: немає ${circuit === "TT" ? "TSM" : "TM"}`);
      continue;
    }
    // Ланцюжок «найближчий сусід» від початку; відстань — евклідова (орієнтовно), а самі ділянки прокладає A*.
    const left = [...pts];
    let cur: PlanElement = start;
    while (left.length > 0) {
      let bi = 0;
      let bd = Infinity;
      left.forEach((p, i) => {
        const d = Math.hypot(p.x - cur.x, p.y - cur.y);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      const next = left.splice(bi, 1)[0]!;
      if (route(circuit, cur, next)) cur = next;
    }
  }

  // Діаметр труби: у кожній клітинці сумуємо площі кабелів різних кіл (одне коло = один кабель, що йде ланцюжком).
  const areaOf = (c: string) => board.find((b) => b.id === c)?.areaMm2 ?? 65;
  const cellCircuits = new Map<number, Set<string>>();
  const legCells = legs.map((l) => {
    const keys = new Set<number>();
    for (let i = 1; i < l.path.length; i++) {
      const a = l.path[i - 1]!;
      const b = l.path[i]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / C));
      for (let s = 0; s <= n; s++) {
        const p = cellOf(a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n);
        const k = p.j * w + p.i;
        keys.add(k);
        let set = cellCircuits.get(k);
        if (!set) cellCircuits.set(k, (set = new Set()));
        set.add(l.circuit);
      }
    }
    return keys;
  });
  const byConduit: ApartmentRoutes["byConduit"] = { 20: 0, 25: 0, 32: 0 };
  legs.forEach((l, i) => {
    let worst = 0;
    for (const k of legCells[i]!) {
      let a = 0;
      for (const c of cellCircuits.get(k)!) a += areaOf(c);
      worst = Math.max(worst, a);
    }
    l.conduit = pickConduit(worst).fi;
  });
  // Довжина труб: кожна клітинка траси береться раз; кабелі кількох кіл в одному коридорі йдуть спільною трубою, а понад ємність fi32 — паралельними.
  const cap32 = CONDUIT_FILL * Math.PI * (28 / 2) ** 2;
  for (const set of cellCircuits.values()) {
    let a = 0;
    for (const c of set) a += areaOf(c);
    const pipes = Math.max(1, Math.ceil(a / cap32));
    const fi = pipes > 1 ? 32 : pickConduit(a).fi;
    byConduit[fi] += pipes * C * (1 + o.reserve);
  }
  const boardNotes: string[] = [];
  const present = new Set(groups.keys());
  for (const c of present) if (c !== "TT" && !board.some((b) => b.id === c)) boardNotes.push(`коло ${c}/TM є на плані, але відсутнє у схемі щита`);
  for (const b of board) if (Number(b.id) <= 9 && !present.has(b.id)) boardNotes.push(`коло ${b.id} (${b.name.uk}) є у схемі щита, але не знайдене на плані`);

  const byCircuit: ApartmentRoutes["byCircuit"] = {};
  let total = 0;
  for (const l of legs) {
    const b = (byCircuit[l.circuit] ??= { lengthMm: 0, horizontalMm: 0, legs: 0 });
    b.lengthMm += l.lengthMm;
    b.horizontalMm += l.horizontalMm;
    b.legs++;
    total += l.lengthMm;
  }
  return { legs, byCircuit, totalMm: total, unreached, byConduit, boardNotes };
}
