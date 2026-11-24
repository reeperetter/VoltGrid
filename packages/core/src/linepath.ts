import { roundMm, type PointMm } from "./geometry";
import type { Project } from "./project";

/** Довжина ортогональної ламаної, мм. */
export function pathLengthMm(path: readonly PointMm[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as PointMm;
    const b = path[i] as PointMm;
    total += Math.abs(b.xMm - a.xMm) + Math.abs(b.yMm - a.yMm);
  }
  return total;
}

/** Прибирає дублікати й проміжні точки на прямих. */
export function simplifyPath(path: readonly PointMm[]): PointMm[] {
  const out: PointMm[] = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (last && last.xMm === p.xMm && last.yMm === p.yMm) continue;
    while (out.length >= 2) {
      const a = out[out.length - 2] as PointMm;
      const b = out[out.length - 1] as PointMm;
      const colinear = (a.xMm === b.xMm && b.xMm === p.xMm) || (a.yMm === b.yMm && b.yMm === p.yMm);
      if (!colinear) break;
      out.pop();
    }
    out.push(p);
  }
  return out;
}

/**
 * Зсуває ланку `index` (між path[index] і path[index+1]) перпендикулярно до себе на нове значення
 * координати. Кінці траси (точки) лишаються на місці — біля них додаються нові повороти.
 * Повертає undefined, якщо ланка не горизонтальна/вертикальна або індекс хибний.
 */
export function moveSegment(
  path: readonly PointMm[],
  index: number,
  to: number,
): PointMm[] | undefined {
  if (index < 0 || index >= path.length - 1) return undefined;
  const a = path[index] as PointMm;
  const b = path[index + 1] as PointMm;
  const v = roundMm(to);
  let a2: PointMm;
  let b2: PointMm;
  if (a.yMm === b.yMm) {
    a2 = { xMm: a.xMm, yMm: v };
    b2 = { xMm: b.xMm, yMm: v };
  } else if (a.xMm === b.xMm) {
    a2 = { xMm: v, yMm: a.yMm };
    b2 = { xMm: v, yMm: b.yMm };
  } else {
    return undefined;
  }
  const head = path.slice(0, index);
  const tail = path.slice(index + 2);
  const result: PointMm[] = [...head];
  if (index === 0) result.push(a); // початок — це точка, лишається
  result.push(a2, b2);
  if (index + 1 === path.length - 1) result.push(b); // кінець — це точка, лишається
  result.push(...tail);
  return simplifyPath(result);
}

/** Записує нову ламану лінії й перераховує обхід (горизонталь і вертикаль не змінюються). */
export function setLinePath(project: Project, lineId: string, path: readonly PointMm[]): Project {
  return {
    ...project,
    lines: project.lines.map((l) => {
      if (l.id !== lineId) return l;
      const first = path[0];
      const last = path[path.length - 1];
      if (!first || !last) return l;
      const direct = Math.abs(first.xMm - last.xMm) + Math.abs(first.yMm - last.yMm);
      return {
        ...l,
        path: [...path],
        segments: { ...l.segments, horizontalMm: direct, detourMm: Math.max(0, pathLengthMm(path) - direct) },
      };
    }),
  };
}
