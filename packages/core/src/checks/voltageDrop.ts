import type { RegionProfile } from "@voltgrid/regions";

export type Phases = 1 | 3;
export type LoadKind = "lighting" | "other";

export interface VoltageDropInput {
  /** Розрахунковий струм лінії Ib, А. */
  currentA: number;
  /**
   * Довжина кабелю в один бік, мм. Для електричного розрахунку беруть чисту трасу
   * (без запасу на закупівлю), тобто `LengthBreakdown.baseMm`.
   */
  lengthMm: number;
  /** Переріз мідної жили, мм². */
  crossSectionMm2: number;
  phases: Phases;
  /** Коефіцієнт потужності навантаження, 0…1. Реактивним опором кабелю нехтуємо (перерізи ≤ 16 мм²). */
  powerFactor?: number;
  /** Тип навантаження для вибору межі з профілю. */
  loadKind: LoadKind;
}

export type VoltageDropStatus = "ok" | "exceeded" | "noLimit";

export interface VoltageDropResult {
  /** Падіння напруги, В. */
  dropV: number;
  /** Номінальна напруга, відносно якої рахується відсоток (230 В для 1ф, 400 В для 3ф). */
  referenceVoltageV: number;
  dropPercent: number;
  /** Межа з профілю, %, або undefined, якщо не задана. */
  limitPercent: number | undefined;
  status: VoltageDropStatus;
}

const PHASE_VOLTAGE_V = 230;
const LINE_VOLTAGE_V = 400;

/**
 * Падіння напруги в мідному кабелі:
 *   1ф:  ΔU = 2 · I · R · cosφ,  R = ρ · L / S
 *   3ф:  ΔU = √3 · I · R · cosφ
 * Відсоток рахується від 230 В (1ф) або 400 В (3ф).
 */
export function checkVoltageDrop(input: VoltageDropInput, region: RegionProfile): VoltageDropResult {
  const { currentA, lengthMm, crossSectionMm2, phases, loadKind } = input;
  const powerFactor = input.powerFactor ?? 1;

  if (!(currentA >= 0)) throw new Error("Струм має бути невід'ємним");
  if (!(lengthMm >= 0)) throw new Error("Довжина має бути невід'ємною");
  if (!(crossSectionMm2 > 0)) throw new Error("Переріз має бути додатним");
  if (!(powerFactor > 0 && powerFactor <= 1)) throw new Error("cosφ має бути в межах (0; 1]");

  const rho = region.voltageDrop.copperResistivityOhmMm2PerM;
  const resistanceOhm = (rho * (lengthMm / 1000)) / crossSectionMm2;
  const factor = phases === 1 ? 2 : Math.sqrt(3);
  const dropV = factor * currentA * resistanceOhm * powerFactor;

  const referenceVoltageV = phases === 1 ? PHASE_VOLTAGE_V : LINE_VOLTAGE_V;
  const dropPercent = (dropV / referenceVoltageV) * 100;
  const limitPercent = region.voltageDrop.limitsPercent[loadKind];

  const status: VoltageDropStatus =
    limitPercent === undefined ? "noLimit" : dropPercent <= limitPercent ? "ok" : "exceeded";

  return { dropV, referenceVoltageV, dropPercent, limitPercent, status };
}
