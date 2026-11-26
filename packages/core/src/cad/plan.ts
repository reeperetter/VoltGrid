/**
 * Плоскі дані плану з DWG: тексти, вставки (блоки) й лінії в системі креслення (мм).
 * Вхід — структура, яку повертає LibreDWG (`convert`), описана тут мінімально, щоб ядро не залежало від бібліотеки.
 */
export interface DwgLikeEntity {
  type: string;
  layer: string;
  [key: string]: unknown;
}

export interface DwgLikeDatabase {
  entities: DwgLikeEntity[];
  tables: { BLOCK_RECORD: { entries: { name: string; basePoint?: { x: number; y: number }; entities?: DwgLikeEntity[] }[] } };
}

export interface FlatText {
  layer: string;
  text: string;
  x: number;
  y: number;
}

export interface FlatInsert {
  name: string;
  layer: string;
  x: number;
  y: number;
  /** Кут повороту вставки з урахуванням батьківських блоків, рад. */
  rot: number;
}

export interface FlatLine {
  layer: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlanData {
  texts: FlatText[];
  inserts: FlatInsert[];
  lines: FlatLine[];
}

interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const MAX_DEPTH = 6;

const mul = (t: Affine, u: Affine): Affine => ({
  a: t.a * u.a + t.c * u.b,
  b: t.b * u.a + t.d * u.b,
  c: t.a * u.c + t.c * u.d,
  d: t.b * u.c + t.d * u.d,
  e: t.a * u.e + t.c * u.f + t.e,
  f: t.b * u.e + t.d * u.f + t.f,
});
const apply = (t: Affine, p: { x: number; y: number }) => ({ x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f });

const pt = (v: unknown): { x: number; y: number } | undefined => {
  if (v && typeof v === "object" && typeof (v as { x?: unknown }).x === "number" && typeof (v as { y?: unknown }).y === "number") {
    return v as { x: number; y: number };
  }
  return undefined;
};

/** Розгортає блоки з афінними перетвореннями й збирає тексти, вставки та відрізки. */
export function extractPlanData(db: DwgLikeDatabase): PlanData {
  const blocks = new Map(db.tables.BLOCK_RECORD.entries.map((b) => [b.name, b]));
  const out: PlanData = { texts: [], inserts: [], lines: [] };

  const walk = (entities: readonly DwgLikeEntity[], t: Affine, layerIn: string, depth: number) => {
    for (const e of entities) {
      const layer = e.layer === "0" ? layerIn : e.layer;
      if (e.type === "TEXT" || e.type === "MTEXT") {
        const p = pt(e["startPoint"]) ?? pt(e["insertionPoint"]);
        const raw = e["text"] ?? e["textString"];
        if (!p || typeof raw !== "string") continue;
        const q = apply(t, p);
        out.texts.push({ layer, text: raw, x: q.x, y: q.y });
      } else if (e.type === "INSERT") {
        const name = String(e["name"] ?? "");
        const ip = pt(e["insertionPoint"]);
        if (!ip) continue;
        const rot = Number(e["rotation"] ?? 0);
        const sx = Number(e["xScale"] ?? 1);
        const sy = Number(e["yScale"] ?? 1);
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const block = blocks.get(name);
        const m: Affine = { a: c * sx, b: s * sx, c: -s * sy, d: c * sy, e: 0, f: 0 };
        const base = apply(m, block?.basePoint ?? { x: 0, y: 0 });
        const tt = mul(t, { ...m, e: ip.x - base.x, f: ip.y - base.y });
        const q = apply(t, ip);
        out.inserts.push({ name, layer, x: q.x, y: q.y, rot: rot + Math.atan2(t.b, t.a) });
        if (block?.entities && depth < MAX_DEPTH) walk(block.entities, tt, layer, depth + 1);
      } else if (e.type === "LINE") {
        const a = pt(e["startPoint"]);
        const b = pt(e["endPoint"]);
        if (!a || !b) continue;
        const qa = apply(t, a);
        const qb = apply(t, b);
        out.lines.push({ layer, x1: qa.x, y1: qa.y, x2: qb.x, y2: qb.y });
      } else if (e.type === "LWPOLYLINE") {
        const v = e["vertices"];
        if (!Array.isArray(v)) continue;
        const closed = (Number(e["flag"] ?? 0) & 1) === 1;
        const count = closed ? v.length : v.length - 1;
        for (let i = 0; i < count; i++) {
          const a = pt(v[i]);
          const b = pt(v[(i + 1) % v.length]);
          if (!a || !b) continue;
          const qa = apply(t, a);
          const qb = apply(t, b);
          out.lines.push({ layer, x1: qa.x, y1: qa.y, x2: qb.x, y2: qb.y });
        }
      }
    }
  };
  walk(db.entities, IDENTITY, "0", 0);
  return out;
}
