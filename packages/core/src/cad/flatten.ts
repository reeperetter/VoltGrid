import type { CadDrawing, CadEntity, CadInsert, CadPoint, CadSegment, FlatDrawing } from "./types";

const MAX_DEPTH = 6;
const ARC_STEPS = 12;

interface Transform {
  a: number; // x' = a*x + c*y + e
  b: number; // y' = b*x + d*y + f
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function apply(t: Transform, p: CadPoint): CadPoint {
  return { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f };
}

/** Композиція: спершу inner, потім outer. */
function compose(outer: Transform, inner: Transform): Transform {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function point(v: unknown): CadPoint | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as { x?: unknown; y?: unknown };
  if (typeof o.x !== "number" || typeof o.y !== "number") return undefined;
  return { x: o.x, y: o.y };
}

function insertTransform(e: CadEntity, basePoint: CadPoint | undefined): Transform | undefined {
  const ip = point(e["insertionPoint"]);
  if (!ip) return undefined;
  const sx = num(e["xScale"], 1);
  const sy = num(e["yScale"], 1);
  const rot = num(e["rotation"], 0);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // p -> R * S * (p - base) + ip
  const bx = basePoint?.x ?? 0;
  const by = basePoint?.y ?? 0;
  const linear: Transform = { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, e: 0, f: 0 };
  const shift = { x: linear.a * -bx + linear.c * -by, y: linear.b * -bx + linear.d * -by };
  return { ...linear, e: shift.x + ip.x, f: shift.y + ip.y };
}

/**
 * Розгортає блоки (INSERT) рекурсивно й повертає відрізки (LINE, LWPOLYLINE, ARC/CIRCLE як ламані)
 * та список усіх вставок із габаритом геометрії. Шар «0» усередині блока успадковує шар вставки.
 */
export function flattenDrawing(drawing: CadDrawing): FlatDrawing {
  const segments: CadSegment[] = [];
  const inserts: CadInsert[] = [];

  const pushSeg = (t: Transform, p: CadPoint, q: CadPoint, layer: string, bbox: BBox | undefined) => {
    const a = apply(t, p);
    const b = apply(t, q);
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer });
    if (bbox) {
      extend(bbox, a);
      extend(bbox, b);
    }
  };

  const walk = (entities: readonly CadEntity[], t: Transform, parentLayer: string, depth: number, bbox: BBox | undefined) => {
    for (const e of entities) {
      const layer = e.layer === "0" || !e.layer ? parentLayer : e.layer;
      switch (e.type) {
        case "LINE": {
          const p = point(e["startPoint"]);
          const q = point(e["endPoint"]);
          if (p && q) pushSeg(t, p, q, layer, bbox);
          break;
        }
        case "LWPOLYLINE":
        case "POLYLINE": {
          const verts = Array.isArray(e["vertices"]) ? (e["vertices"] as unknown[]).map(point).filter((v): v is CadPoint => !!v) : [];
          const closed = e["flag"] !== undefined ? (num(e["flag"]) & 512) !== 0 || (num(e["flag"]) & 1) !== 0 : e["closed"] === true;
          for (let i = 1; i < verts.length; i++) pushSeg(t, verts[i - 1] as CadPoint, verts[i] as CadPoint, layer, bbox);
          if (closed && verts.length > 2) pushSeg(t, verts[verts.length - 1] as CadPoint, verts[0] as CadPoint, layer, bbox);
          break;
        }
        case "ARC":
        case "CIRCLE": {
          const c = point(e["center"]);
          const r = num(e["radius"]);
          if (!c || r <= 0) break;
          const full = e.type === "CIRCLE";
          let a0 = full ? 0 : num(e["startAngle"]);
          let a1 = full ? Math.PI * 2 : num(e["endAngle"]);
          if (a1 <= a0) a1 += Math.PI * 2;
          const steps = Math.max(4, Math.ceil(((a1 - a0) / (Math.PI * 2)) * ARC_STEPS * 2));
          let prev: CadPoint = { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) };
          for (let i = 1; i <= steps; i++) {
            const ang = a0 + ((a1 - a0) * i) / steps;
            const cur = { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) };
            pushSeg(t, prev, cur, layer, bbox);
            prev = cur;
          }
          break;
        }
        case "INSERT": {
          const name = typeof e["name"] === "string" ? (e["name"] as string) : "";
          const block = drawing.blocks[name];
          const bt = insertTransform(e, block?.basePoint);
          if (!bt) break;
          const total = compose(t, bt);
          const myBox: BBox = emptyBox();
          if (block && depth < MAX_DEPTH) walk(block.entities, total, layer, depth + 1, myBox);
          if (bbox && isFinite(myBox.minX)) {
            extend(bbox, { x: myBox.minX, y: myBox.minY });
            extend(bbox, { x: myBox.maxX, y: myBox.maxY });
          }
          const ip = apply(t, point(e["insertionPoint"]) ?? { x: 0, y: 0 });
          const scale = Math.hypot(total.a, total.b);
          inserts.push({
            name,
            layer,
            x: ip.x,
            y: ip.y,
            rotation: Math.atan2(total.b, total.a),
            scale,
            ...(isFinite(myBox.minX) ? { bbox: { ...myBox } } : {}),
          });
          break;
        }
        default:
          break;
      }
    }
  };

  walk(drawing.entities, IDENTITY, "0", 0, undefined);
  return { segments, inserts };
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
const emptyBox = (): BBox => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
function extend(b: BBox, p: CadPoint): void {
  if (p.x < b.minX) b.minX = p.x;
  if (p.y < b.minY) b.minY = p.y;
  if (p.x > b.maxX) b.maxX = p.x;
  if (p.y > b.maxY) b.maxY = p.y;
}
