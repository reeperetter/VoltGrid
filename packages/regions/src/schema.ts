import { z } from "zod";

export const CableTypeSchema = z.object({
  id: z.string().min(1),
  /** Відображувана назва, напр. «YDYp 3×2,5». */
  name: z.string().min(1),
  category: z.enum(["power", "lowCurrent"]),
  coreCount: z.number().int().positive(),
  /** Переріз жили, мм². Для слабкострумових кабелів може бути відсутній. */
  crossSectionMm2: z.number().positive().optional(),
  /** Стандартні довжини бухт, цілі метри. */
  reelLengthsM: z.array(z.number().int().positive()).min(1),
});

/**
 * Регіональний профіль: усі норми, коефіцієнти й типові значення країни.
 * Код ядра не містить жодних «зашитих» нормативних чисел — лише читає профіль.
 */
export const RegionProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /**
   * "draft" — значення — стартові заготовки, їх треба звірити з чинними нормами.
   * "verified" — звірено з нормативними документами.
   */
  status: z.enum(["draft", "verified"]),
  standards: z.array(z.string().min(1)).min(1),
  defaultLanguage: z.string().min(2),
  currency: z.string().length(3),
  vat: z.object({
    /** Доступні ставки ПДВ, %. */
    rates: z.array(z.number().nonnegative()).min(1),
    defaultRate: z.number().nonnegative(),
  }),
  /** Типовий запас на довжину кабелю, %. Користувач може змінити. */
  defaultReservePercent: z.number().nonnegative(),
  /** Типові висоти встановлення від чистової підлоги, мм. */
  mountingHeightsMm: z.object({
    socket: z.number().int().positive(),
    switch: z.number().int().positive(),
  }),
  cableTypes: z.array(CableTypeSchema).min(1),
});

export type CableType = z.infer<typeof CableTypeSchema>;
export type RegionProfile = z.infer<typeof RegionProfileSchema>;
