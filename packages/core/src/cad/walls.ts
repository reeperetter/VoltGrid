import type { CadSegment } from "./types";

export interface WallPiece {
  startMm: { xMm: number; yMm: number };
  endMm: { xMm: number; yMm: number };
  thicknessMm: number;
}

export interface WallExtractOptions {
  minThicknessMm: number;
  maxThicknessMm: number;
  /** Мінімальна довжина спільної ділянки двох паралельних ліній. */
  minOverlapMm: number;
  /** Скільки мм розриву між колінеарними шматками вважати однією стіною (дверні/віконні прорізи). */
  mergeGapMm: number;
  /** Мінімальна довжина відрізка, що розглядається. */
  minSegmentMm: number;
}

export const DEFAULT_WALL_EXTRACT: WallExtractOptions = {
  minThicknessMm: 60,
  maxThicknessMm: 700,
  minOverlapMm: 150,
  mergeGapMm: 1300,
  minSegmentMm: 100,
};

interface Item {
  t1: number;
  t2: number;
  d: number;
}

interface Piece {
  t1: number;
  t2: number;
  center: number;
  thickness: number;
}

const ANGLE_STEPS = 720; // 0,25° на корзину

/**
 * Знаходить стіни за контурами: Revit/ArchiCAD експортують стіну як дві паралельні лінії.
 * Для кожної пари ліній на відстані [minThickness; maxThickness] із достатнім перекриттям створюється
 * шматок стіни; колінеарні шматки зі схожою товщиною об'єднуються (через проріз до mergeGapMm).
 * Координати — мм у системі креслення (без віддзеркалення).
 */
export function extractWalls(segments: readonly CadSegment[], options: Partial<WallExtractOptions> = {}): WallPiece[] {
  const o = { ...DEFAULT_WALL_EXTRACT, ...options };

  const buckets = new Map<number, Item[]>();
  for (const s of segments) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy);
    if (len < o.minSegmentMm) continue;
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI;
    if (angle >= Math.PI) angle -= Math.PI;
    const key = Math.round((angle / Math.PI) * ANGLE_STEPS) % ANGLE_STEPS;
    const theta = (key / ANGLE_STEPS) * Math.PI;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const t1 = s.x1 * ux + s.y1 * uy;
    const t2 = s.x2 * ux + s.y2 * uy;
    const d = (-s.x1 * uy + s.y1 * ux + (-s.x2 * uy + s.y2 * ux)) / 2;
    const item: Item = { t1: Math.min(t1, t2), t2: Math.max(t1, t2), d };
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }

  const result: WallPiece[] = [];
  for (const [key, items] of buckets) {
    const theta = (key / ANGLE_STEPS) * Math.PI;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    items.sort((a, b) => a.d - b.d);

    const pieces: Piece[] = [];
    for (let i = 0; i < items.length; i++) {
      const a = items[i] as Item;
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j] as Item;
        const gap = b.d - a.d;
        if (gap > o.maxThicknessMm) break;
        if (gap < o.minThicknessMm) continue;
        const t1 = Math.max(a.t1, b.t1);
        const t2 = Math.min(a.t2, b.t2);
        if (t2 - t1 < o.minOverlapMm) continue;
        pieces.push({ t1, t2, center: (a.d + b.d) / 2, thickness: gap });
      }
    }
    for (const merged of mergePieces(pieces, o.mergeGapMm)) {
      const n = { x: -uy, y: ux };
      result.push({
        startMm: { xMm: merged.t1 * ux + merged.center * n.x, yMm: merged.t1 * uy + merged.center * n.y },
        endMm: { xMm: merged.t2 * ux + merged.center * n.x, yMm: merged.t2 * uy + merged.center * n.y },
        thicknessMm: merged.thickness,
      });
    }
  }
  return result;
}

function mergePieces(pieces: Piece[], mergeGap: number): Piece[] {
  if (pieces.length === 0) return [];
  // Кластеризація за віссю й товщиною.
  const sorted = [...pieces].sort((a, b) => a.center - b.center);
  const clusters: Piece[][] = [];
  for (const p of sorted) {
    const cluster = clusters.find((c) => {
      const ref = c[0] as Piece;
      return Math.abs(ref.center - p.center) <= 30 && Math.abs(ref.thickness - p.thickness) <= 40;
    });
    if (cluster) cluster.push(p);
    else clusters.push([p]);
  }
  const out: Piece[] = [];
  for (const cluster of clusters) {
    cluster.sort((a, b) => a.t1 - b.t1);
    let cur: Piece[] = [cluster[0] as Piece];
    let curEnd = (cluster[0] as Piece).t2;
    const flush = () => {
      const total = cur.reduce((s, p) => s + (p.t2 - p.t1), 0) || 1;
      out.push({
        t1: (cur[0] as Piece).t1,
        t2: curEnd,
        center: cur.reduce((s, p) => s + p.center * (p.t2 - p.t1), 0) / total,
        thickness: cur.reduce((s, p) => s + p.thickness * (p.t2 - p.t1), 0) / total,
      });
    };
    for (let i = 1; i < cluster.length; i++) {
      const p = cluster[i] as Piece;
      if (p.t1 - curEnd <= mergeGap) {
        cur.push(p);
        curEnd = Math.max(curEnd, p.t2);
      } else {
        flush();
        cur = [p];
        curEnd = p.t2;
      }
    }
    flush();
  }
  return out;
}
