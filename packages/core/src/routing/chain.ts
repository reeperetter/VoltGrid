import type { PointMm } from "../geometry";

export interface ChainPoint {
  id: string;
  xMm: number;
  yMm: number;
}

function manhattan(a: PointMm, b: PointMm): number {
  return Math.abs(a.xMm - b.xMm) + Math.abs(a.yMm - b.yMm);
}

/**
 * Порядок підключення точок кола за методикою: живлення від щита до найближчої точки,
 * далі «перемички» від точки до найближчої з тих, що лишилися (жадібно).
 * При рівній відстані перемагає точка з меншим id — результат детермінований.
 */
export function orderChain(board: PointMm, points: readonly ChainPoint[]): ChainPoint[] {
  const remaining = [...points];
  const ordered: ChainPoint[] = [];
  let current: PointMm = board;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((p, i) => {
      const d = manhattan(current, { xMm: p.xMm, yMm: p.yMm });
      const best = remaining[bestIndex] as ChainPoint;
      if (d < bestDistance || (d === bestDistance && p.id < best.id)) {
        bestDistance = d;
        bestIndex = i;
      }
    });
    const [next] = remaining.splice(bestIndex, 1) as [ChainPoint];
    ordered.push(next);
    current = { xMm: next.xMm, yMm: next.yMm };
  }
  return ordered;
}
