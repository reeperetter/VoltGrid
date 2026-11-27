import type { PlanInsert, PlanText } from "./count";

export interface Barrier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DoorSeal {
  x: number;
  y: number;
  /** Напрям полотна, рад. Печатка рисується в обидва боки на widthMm. */
  angle: number;
  widthMm: number;
}

export interface RegionOptions {
  cellMm: number;
  minAreaM2: number;
  maxAreaM2: number;
  /** Радіуси кілець навколо TM для пошуку точки всередині квартири. */
  seedRadiiMm: number[];
  /** Наскільки далеко (мм) від межі квартири підпис вважається її власним (розетка в стіні). */
  ownReachMm: number;
  /** Скільки підписів кіл «N/TM» має бути всередині квартири, щоб вважати область квартирою. */
  minLabels: number;
}

export const DEFAULT_REGION_OPTIONS: RegionOptions = {
  cellMm: 50,
  minAreaM2: 12,
  maxAreaM2: 110,
  seedRadiiMm: [800, 1400, 2000],
  ownReachMm: 300,
  minLabels: 3,
};

export interface ApartmentRegion {
  id: number;
  tm: { x: number; y: number };
  areaM2: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  owns(x: number, y: number): boolean;
}

/** Растрова сітка: стіни, вікна й вхідні двері — перешкоди; квартира — зв'язна вільна область. */
export function findApartmentRegions(
  barriers: readonly Barrier[],
  seals: readonly DoorSeal[],
  tms: readonly { x: number; y: number }[],
  tsms: readonly { x: number; y: number }[],
  options: Partial<RegionOptions> = {},
  labels: readonly { x: number; y: number }[] = [],
  /** Варіанти вхідних дверей для TM (кожен варіант — набір печаток); перебираються, доки не вийде правдоподібна квартира. */
  sealVariants?: (tm: { x: number; y: number }) => DoorSeal[][],
): { regions: ApartmentRegion[]; failed: { x: number; y: number }[] } {
  const o = { ...DEFAULT_REGION_OPTIONS, ...options };
  const C = o.cellMm;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of barriers) {
    x0 = Math.min(x0, b.x1, b.x2);
    x1 = Math.max(x1, b.x1, b.x2);
    y0 = Math.min(y0, b.y1, b.y2);
    y1 = Math.max(y1, b.y1, b.y2);
  }
  x0 = Math.floor(x0 / C) * C - 500;
  y0 = Math.floor(y0 / C) * C - 500;
  const W = Math.ceil((x1 - x0) / C) + 10;
  const H = Math.ceil((y1 - y0) / C) + 10;
  const baseWall = new Uint8Array(W * H);
  let wall = baseWall;

  const draw = (ax: number, ay: number, bx: number, by: number, th: number) => {
    const n = Math.max(2, Math.ceil((Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / C) * 2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const ci = Math.floor((ax + (bx - ax) * t - x0) / C);
      const cj = Math.floor((ay + (by - ay) * t - y0) / C);
      for (let a = -th + 1; a < th; a++) {
        for (let b = -th + 1; b < th; b++) {
          const i = ci + a;
          const j = cj + b;
          if (i >= 0 && i < W && j >= 0 && j < H) wall[j * W + i] = 1;
        }
      }
    }
  };
  for (const b of barriers) draw(b.x1, b.y1, b.x2, b.y2, 1);
  for (const s of seals) {
    for (const sgn of [1, -1]) {
      draw(s.x, s.y, s.x + sgn * s.widthMm * Math.cos(s.angle), s.y + sgn * s.widthMm * Math.sin(s.angle), 2);
    }
  }

  const cellOf = (x: number, y: number) => ({ i: Math.floor((x - x0) / C), j: Math.floor((y - y0) / C) });
  const owner = new Int32Array(W * H).fill(-1);
  const taken = new Uint8Array(W * H); // зайняті ділянки не віддаємо двом TM
  const visit = new Int32Array(W * H);
  const triedAt = new Int32Array(W * H);
  let floodStamp = 0;
  let variantStamp = 0;

  const flood = (si: number, sj: number): number[] | undefined => {
    const start = sj * W + si;
    if (wall[start]) return undefined;
    const stamp = ++floodStamp;
    visit[start] = stamp;
    const queue = [start];
    const maxCells = (o.maxAreaM2 * 1e6) / (C * C);
    for (let h = 0; h < queue.length; h++) {
      if (queue.length > maxCells) return undefined; // витік у коридор/зовні
      const c = queue[h]!;
      const ci = c % W;
      const cj = (c - ci) / W;
      if (ci === 0 || cj === 0 || ci === W - 1 || cj === H - 1) return undefined;
      for (const n of [c + 1, c - 1, c + W, c - W]) {
        if (!wall[n] && visit[n] !== stamp) {
          visit[n] = stamp;
          queue.push(n);
        }
      }
    }
    return queue;
  };

  const regions: ApartmentRegion[] = [];
  const failed: { x: number; y: number }[] = [];
  const angles = 8;

  tms.forEach((tm, idx) => {
    const tsm = tsms.reduce<{ x: number; y: number } | undefined>(
      (best, t) =>
        !best || Math.hypot(t.x - tm.x, t.y - tm.y) < Math.hypot(best.x - tm.x, best.y - tm.y) ? t : best,
      undefined,
    );
    let best: { cells: number[]; score: number } | undefined;
    const variants: DoorSeal[][] = [[], ...(sealVariants ? sealVariants(tm) : [])];
    for (const extra of variants) {
    wall = extra.length === 0 ? baseWall : baseWall.slice();
    for (const sl of extra) {
      for (const sgn of [1, -1]) {
        draw(sl.x, sl.y, sl.x + sgn * sl.widthMm * Math.cos(sl.angle), sl.y + sgn * sl.widthMm * Math.sin(sl.angle), 2);
      }
    }
    variantStamp++;
    for (const r of o.seedRadiiMm) {
      for (let a = 0; a < angles; a++) {
        const th = (a / angles) * Math.PI * 2;
        const { i, j } = cellOf(tm.x + r * Math.cos(th), tm.y + r * Math.sin(th));
        if (i < 0 || j < 0 || i >= W || j >= H || wall[j * W + i] || triedAt[j * W + i] === variantStamp) continue;
        const cells = flood(i, j);
        if (!cells) {
          continue;
        }
        const myStamp = floodStamp;
        for (const c of cells) triedAt[c] = variantStamp;
        const area = (cells.length * C * C) / 1e6;
        if (area < o.minAreaM2 || cells.some((c) => taken[c] === 1)) continue;
        // оцінка: TM і TSM мають бути поряд із межею області, чим ближче, тим краще
        const near = (p: { x: number; y: number } | undefined) => {
          if (!p) return 0;
          const { i: pi, j: pj } = cellOf(p.x, p.y);
          const reach = 6;
          for (let d = 0; d <= reach; d++) {
            for (let a2 = -d; a2 <= d; a2++) {
              for (let b2 = -d; b2 <= d; b2++) {
                if (Math.max(Math.abs(a2), Math.abs(b2)) !== d) continue;
                const ii = pi + a2;
                const jj = pj + b2;
                if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
                if (visit[jj * W + ii] === myStamp) return reach + 1 - d;
              }
            }
          }
          return 0;
        };
        const nTm = near(tm);
        const nTsm = near(tsm);
        if (nTm === 0 || (tsm && nTsm === 0)) continue;
        let inside = 0;
        if (labels.length > 0) {
          for (const lb of labels) {
            const { i: li, j: lj } = cellOf(lb.x, lb.y);
            let hit = false;
            for (let da = -2; da <= 2 && !hit; da++) {
              for (let db = -2; db <= 2 && !hit; db++) {
                if (visit[(lj + db) * W + li + da] === myStamp) hit = true;
              }
            }
            if (hit) inside++;
          }
          if (inside < o.minLabels) continue;
        }
        const score = nTm + nTsm * 2 + Math.min(area, 80) / 100 + Math.min(inside, 20) / 10;
        if (!best || score > best.score) best = { cells, score };
      }
    }
    }
    wall = baseWall;
    if (!best) {
      failed.push(tm);
      return;
    }
    const id = regions.length;
    let rx0 = Infinity;
    let ry0 = Infinity;
    let rx1 = -Infinity;
    let ry1 = -Infinity;
    for (const c of best.cells) {
      taken[c] = 1;
      owner[c] = id;
      const ci = c % W;
      const cj = (c - ci) / W;
      rx0 = Math.min(rx0, ci);
      rx1 = Math.max(rx1, ci);
      ry0 = Math.min(ry0, cj);
      ry1 = Math.max(ry1, cj);
    }
    regions.push({
      id,
      tm,
      areaM2: (best.cells.length * C * C) / 1e6,
      bbox: { x0: x0 + rx0 * C, y0: y0 + ry0 * C, x1: x0 + (rx1 + 1) * C, y1: y0 + (ry1 + 1) * C },
      owns: () => false,
    });
    void idx;
  });

  // Підписи у товщі стіни: найближча зайнята клітинка в межах ownReachMm.
  const reach = Math.ceil(o.ownReachMm / C);
  for (const r of regions) {
    r.owns = (x, y) => {
      const { i, j } = cellOf(x, y);
      let bestD = Infinity;
      let bestId = -1;
      for (let a = -reach; a <= reach; a++) {
        for (let b = -reach; b <= reach; b++) {
          const ii = i + a;
          const jj = j + b;
          if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
          const id = owner[jj * W + ii]!;
          if (id < 0) continue;
          const d = a * a + b * b;
          if (d < bestD) {
            bestD = d;
            bestId = id;
          }
        }
      }
      return bestId === r.id;
    };
  }
  return { regions, failed };
}

export const BARRIER_LAYERS: readonly string[] = [
  "A-WALL",
  "I-WALL",
  "A-GLAZ",
  "A-GLAZ-CURT",
  "A-GLAZ-CWMG",
  "A-DOOR-FRAM",
  "A-GENM",
];

export const ENTRANCE_DOOR_RE = /Wejściow|DWM1_IN|90x200_mieszkaniowa/i;

export function collectEntranceSeals(inserts: readonly (PlanInsert & { rot?: number })[]): DoorSeal[] {
  return inserts
    .filter((i) => i.layer === "A-DOOR" && ENTRANCE_DOOR_RE.test(i.name))
    .map((i) => ({ x: i.x, y: i.y, angle: i.rot ?? 0, widthMm: 900 }));
}

export type { PlanText };

/**
 * Вхідні двері без назви блока (PDF): це проріз у стіні поруч із TM. Шукаємо дві колінеарні лінії стіни,
 * кінці яких дивляться одна на одну на відстані 0,65–1,4 м; обираємо ближчий до TM проріз
 * і повертаємо печатки для всіх схожих пар поруч із ним.
 */
export function findEntranceGapVariants(barriers: readonly Barrier[], tm: { x: number; y: number }): DoorSeal[][] {
  const reach = 2600;
  const ends: { x: number; y: number; ang: number }[] = [];
  for (const s of barriers) {
    if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 150) continue;
    for (const [x, y, ox, oy] of [
      [s.x1, s.y1, s.x2, s.y2],
      [s.x2, s.y2, s.x1, s.y1],
    ] as const) {
      if (Math.hypot(x - tm.x, y - tm.y) < reach) ends.push({ x, y, ang: Math.atan2(oy - y, ox - x) });
    }
  }
  const diff = (a: number, t: number) => {
    const e = Math.abs(a - t) % Math.PI;
    return Math.min(e, Math.PI - e);
  };
  const cands: DoorSeal[] = [];
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const a = ends[i]!;
      const b = ends[j]!;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < 650 || dist > 1400) continue;
      const dir = Math.atan2(b.y - a.y, b.x - a.x);
      if (diff(a.ang, dir + Math.PI) < 0.12 && diff(b.ang, dir) < 0.12) {
        cands.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: dir, widthMm: dist / 2 + 50 });
      }
    }
  }
  // Кластери за положенням (500 мм): один проріз — один варіант, але з усіма його парами ліній.
  const groups: DoorSeal[][] = [];
  for (const c of cands) {
    const g = groups.find((gr) => Math.hypot(gr[0]!.x - c.x, gr[0]!.y - c.y) < 500);
    if (g) g.push(c);
    else groups.push([c]);
  }
  groups.sort(
    (p, q) => Math.hypot(p[0]!.x - tm.x, p[0]!.y - tm.y) - Math.hypot(q[0]!.x - tm.x, q[0]!.y - tm.y),
  );
  return groups.slice(0, 6);
}
