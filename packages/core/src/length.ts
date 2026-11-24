import { z } from "zod";

const NonNegativeMm = z.number().int().nonnegative();

/** Складові траси однієї лінії, цілі мм. */
export const RouteSegmentsSchema = z.object({
  /** Горизонтальні ділянки по стелі / у штробі / під стяжкою. */
  horizontalMm: NonNegativeMm,
  /** Вертикальні опуски й підйоми (до розетки, вимикача, щита). */
  verticalMm: NonNegativeMm,
  /** Додаткова довжина на обхід отворів. */
  detourMm: NonNegativeMm,
});

export type RouteSegments = z.infer<typeof RouteSegmentsSchema>;

/** Повна деталізація довжини — «без прихованих формул». */
export interface LengthBreakdown {
  horizontalMm: number;
  verticalMm: number;
  detourMm: number;
  /** Чиста траса: горизонталь + опуски + обходи. */
  baseMm: number;
  reservePercent: number;
  /** Запас, округлений до цілого мм угору. */
  reserveMm: number;
  /** Підсумок: baseMm + reserveMm. */
  totalMm: number;
}

/**
 * L = (горизонталь + вертикаль + обходи) × (1 + K_запасу).
 * Усе в цілих мм; запас округлюється вгору, щоб не недорахувати кабель.
 */
export function calcLineLength(segments: RouteSegments, reservePercent: number): LengthBreakdown {
  const s = RouteSegmentsSchema.parse(segments);
  if (!Number.isFinite(reservePercent) || reservePercent < 0) {
    throw new Error("Запас має бути невід'ємним числом");
  }

  const baseMm = s.horizontalMm + s.verticalMm + s.detourMm;
  // Округлення до 1e-6 прибирає похибку плаваючої коми (1000 × 10 % не стає 101 мм).
  const exactReserve = Math.round(baseMm * reservePercent * 1e6) / 1e8;
  const reserveMm = Math.ceil(exactReserve);

  return {
    horizontalMm: s.horizontalMm,
    verticalMm: s.verticalMm,
    detourMm: s.detourMm,
    baseMm,
    reservePercent,
    reserveMm,
    totalMm: baseMm + reserveMm,
  };
}
