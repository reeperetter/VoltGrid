export interface OverloadInput {
  /** Розрахунковий струм кола Ib, А. */
  designCurrentA: number;
  /** Номінальний (або встановлений) струм захисного апарата In, А. */
  ratedCurrentA: number;
  /** Тривало допустимий струм кабелю Iz, А (береться за способом прокладання). */
  cableCapacityA: number;
  /**
   * Коефіцієнт k2 (I2 = k2 · In). Для автоматів B, C, D дорівнює 1,45;
   * для запобіжників 1,6–2,1 (за SEP: ochrona przed prądem przetężeniowym w instalacjach nn).
   */
  k2?: number;
}

export interface OverloadResult {
  /** Умова 1: Ib ≤ In ≤ Iz. */
  condition1: boolean;
  /** Умова 2: I2 ≤ 1,45 · Iz, де I2 = k2 · In. */
  condition2: boolean;
  tripCurrentA: number;
  limitCurrentA: number;
  ok: boolean;
}

export const BREAKER_K2 = 1.45;
const CABLE_OVERLOAD_FACTOR = 1.45;

export function checkOverload(input: OverloadInput): OverloadResult {
  const { designCurrentA: ib, ratedCurrentA: inA, cableCapacityA: iz } = input;
  const k2 = input.k2 ?? BREAKER_K2;

  if (!(ib >= 0) || !(inA > 0) || !(iz > 0) || !(k2 > 0)) {
    throw new Error("Струми й k2 мають бути додатними (Ib — невід'ємним)");
  }

  const tripCurrentA = k2 * inA;
  const limitCurrentA = CABLE_OVERLOAD_FACTOR * iz;
  const condition1 = ib <= inA && inA <= iz;
  const condition2 = tripCurrentA <= limitCurrentA;

  return { condition1, condition2, tripCurrentA, limitCurrentA, ok: condition1 && condition2 };
}
