import { z } from "zod";

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
  /** Стандартні довжини бухт кабелю, м. */
  cableReelLengthsM: z.array(z.number().positive()).min(1),
  /** Типовий запас на довжину кабелю, %. Користувач може змінити. */
  defaultReservePercent: z.number().nonnegative(),
  /** Типові висоти встановлення від чистової підлоги, мм. */
  mountingHeightsMm: z.object({
    socket: z.number().int().positive(),
    switch: z.number().int().positive(),
  }),
});

export type RegionProfile = z.infer<typeof RegionProfileSchema>;
