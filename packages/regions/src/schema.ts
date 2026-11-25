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
    /** Висота квартирного щитка від чистової підлоги, якщо в проєкті не вказано іншої. */
    board: z.number().int().positive(),
  }),
  wiring: z.object({
    /** Глибина технічної підлоги: на скільки траса по підлозі нижча за чистову підлогу, мм. */
    technicalFloorOffsetMm: z.number().int().nonnegative(),
    /** Відстань траси по підлозі від стін, мм. */
    wallClearanceMm: z.number().int().nonnegative(),
    /** Тип кабелю за замовчуванням для кола залежно від виду точок (id з cableTypes). */
    defaultCableByPointKind: z.record(z.string(), z.string()),
  }),
  /**
   * Типові навантаження для чернеткового розрахунку кола, поки користувач не задав свої.
   * Значення потребують звірки (див. docs/OPEN-QUESTIONS.md, розділ C).
   */
  typicalLoads: z.object({
    /** Потужність однієї точки за видом, Вт (вид без запису не враховується). */
    pointPowerW: z.record(z.string(), z.number().nonnegative()),
    /** Коефіцієнт одночасності кола, 0…1. */
    simultaneityFactor: z.number().positive().max(1),
    phaseVoltageV: z.number().positive(),
    powerFactor: z.number().positive().max(1),
  }),
  cableTypes: z.array(CableTypeSchema).min(1),
  voltageDrop: z.object({
    /** Температура жили, для якої заданий питомий опір, °C. */
    conductorTemperatureC: z.number(),
    /** Питомий опір міді при цій температурі, Ом·мм²/м. */
    copperResistivityOhmMm2PerM: z.number().positive(),
    /**
     * Допустимі падіння напруги, %. Поля необов'язкові:
     * поки межі не звірено з нормою, вони не задані й перевірка повертає «межу не задано».
     */
    limitsPercent: z
      .object({
        lighting: z.number().positive().optional(),
        other: z.number().positive().optional(),
      })
      .default({}),
  }),
});

export type CableType = z.infer<typeof CableTypeSchema>;
export type RegionProfile = z.infer<typeof RegionProfileSchema>;
