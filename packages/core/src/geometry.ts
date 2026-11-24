/** Точка в мм (світові координати плану). Проміжні обчислення можуть бути дробовими. */
export interface PointMm {
  xMm: number;
  yMm: number;
}

/** Округлення до цілого мм без «від'ємного нуля». */
export function roundMm(value: number): number {
  return Math.round(value) + 0;
}

export function roundPoint(p: PointMm): PointMm {
  return { xMm: roundMm(p.xMm), yMm: roundMm(p.yMm) };
}

export function distanceMm(a: PointMm, b: PointMm): number {
  return Math.hypot(b.xMm - a.xMm, b.yMm - a.yMm);
}

/** Прив'язка до сітки з кроком gridMm. */
export function snapToGrid(p: PointMm, gridMm: number): PointMm {
  if (!(gridMm > 0)) throw new Error("Крок сітки має бути додатним");
  return {
    xMm: Math.round(p.xMm / gridMm) * gridMm + 0,
    yMm: Math.round(p.yMm / gridMm) * gridMm + 0,
  };
}

/** Ортогональна прив'язка: кінець відрізка вирівнюється по горизонталі або вертикалі від `from`. */
export function snapOrthogonal(from: PointMm, to: PointMm): PointMm {
  const dx = Math.abs(to.xMm - from.xMm);
  const dy = Math.abs(to.yMm - from.yMm);
  return dx >= dy ? { xMm: to.xMm, yMm: from.yMm } : { xMm: from.xMm, yMm: to.yMm };
}

export interface SegmentProjection {
  /** Положення проєкції на відрізку, 0…1. */
  t: number;
  /** Відстань від початку відрізка до проєкції вздовж нього, мм. */
  offsetMm: number;
  /** Відстань від точки до відрізка, мм. */
  distanceMm: number;
}

/** Проєкція точки на відрізок a–b (обмежена кінцями відрізка). */
export function projectOnSegment(p: PointMm, a: PointMm, b: PointMm): SegmentProjection {
  const dx = b.xMm - a.xMm;
  const dy = b.yMm - a.yMm;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return { t: 0, offsetMm: 0, distanceMm: distanceMm(p, a) };
  }
  const raw = ((p.xMm - a.xMm) * dx + (p.yMm - a.yMm) * dy) / lengthSq;
  const t = Math.min(1, Math.max(0, raw));
  const foot = { xMm: a.xMm + t * dx, yMm: a.yMm + t * dy };
  return { t, offsetMm: t * Math.sqrt(lengthSq), distanceMm: distanceMm(p, foot) };
}

/** Найближча з цільових точок у радіусі radiusMm, або undefined. */
export function nearestTarget(
  p: PointMm,
  targets: readonly PointMm[],
  radiusMm: number,
): PointMm | undefined {
  let best: PointMm | undefined;
  let bestDistance = radiusMm;
  for (const t of targets) {
    const d = distanceMm(p, t);
    if (d <= bestDistance) {
      best = t;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Масштаб підкладки з PDF за відомим масштабом креслення 1:denominator.
 * pxPerPdfPoint — скільки пікселів зображення припадає на один пункт PDF (1 pt = 1/72 дюйма = 25,4/72 мм на папері).
 * Повертає мм реального розміру на піксель.
 */
export function mmPerPxFromDrawingScale(denominator: number, pxPerPdfPoint: number): number {
  if (!(denominator > 0)) throw new Error("Знаменник масштабу має бути додатним");
  if (!(pxPerPdfPoint > 0)) throw new Error("Щільність пікселів має бути додатною");
  return ((25.4 / 72) * denominator) / pxPerPdfPoint;
}

/**
 * Калібрування масштабу підкладки: користувач позначив відрізок, який у поточному масштабі
 * має довжину measuredMm, а в реальності — realMm. Повертає новий масштаб (мм на піксель).
 */
export function rescaleMmPerPx(currentMmPerPx: number, measuredMm: number, realMm: number): number {
  if (!(currentMmPerPx > 0)) throw new Error("Поточний масштаб має бути додатним");
  if (!(measuredMm > 0)) throw new Error("Позначений відрізок має ненульову довжину");
  if (!(realMm > 0)) throw new Error("Фактична довжина має бути додатною");
  return (currentMmPerPx * realMm) / measuredMm;
}
