import type { CableType, RegionProfile } from "@voltgrid/regions";
import { calcLineLength, type LengthBreakdown } from "./length";
import type { Line, Project } from "./project";
import { planReels, type ReelCount, type ReelPlan } from "./reels";

/**
 * Як рахувати бухти:
 * - "global": довжини всіх ліній одного кабелю сумуються, бухти підбираються на всю суму
 *   (залишок бухти використовується в інших групах);
 * - "perGroup": бухти підбираються окремо для кожної групи (залишок не переходить між групами).
 */
export type ReelMode = "global" | "perGroup";

export interface CalcOptions {
  reelMode: ReelMode;
  /** Запас на довжину, %. Якщо не задано — береться з регіонального профілю. */
  reservePercent?: number;
}

export interface LineResult {
  lineId: string;
  groupId: string;
  cableTypeId: string;
  length: LengthBreakdown;
}

export interface CableOrder {
  cableTypeId: string;
  cableName: string;
  requiredMm: number;
  purchasedMm: number;
  leftoverMm: number;
  reels: ReelCount[];
}

export interface CableCalculation {
  lines: LineResult[];
  orders: CableOrder[];
}

function mergeReels(plans: readonly ReelPlan[]): ReelCount[] {
  const counts = new Map<number, number>();
  for (const plan of plans) {
    for (const r of plan.reels) {
      counts.set(r.lengthM, (counts.get(r.lengthM) ?? 0) + r.count);
    }
  }
  return [...counts.entries()]
    .map(([lengthM, count]) => ({ lengthM, count }))
    .sort((a, b) => b.lengthM - a.lengthM);
}

function sumMm(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Рахує довжини всіх ліній проєкту та замовлення кабелю з урахуванням бухт. */
export function calcProjectCables(
  project: Project,
  region: RegionProfile,
  options: CalcOptions,
): CableCalculation {
  const reservePercent = options.reservePercent ?? region.defaultReservePercent;
  const cableById = new Map<string, CableType>(region.cableTypes.map((c) => [c.id, c]));

  const lines: LineResult[] = project.lines.map((line: Line) => {
    if (!cableById.has(line.cableTypeId)) {
      throw new Error(`Лінія ${line.id}: невідомий тип кабелю ${line.cableTypeId}`);
    }
    return {
      lineId: line.id,
      groupId: line.groupId,
      cableTypeId: line.cableTypeId,
      length: calcLineLength(line.segments, reservePercent),
    };
  });

  const byCable = new Map<string, LineResult[]>();
  for (const line of lines) {
    const bucket = byCable.get(line.cableTypeId) ?? [];
    bucket.push(line);
    byCable.set(line.cableTypeId, bucket);
  }

  const orders: CableOrder[] = [];
  for (const [cableTypeId, cableLines] of byCable) {
    const cable = cableById.get(cableTypeId) as CableType;
    let plans: ReelPlan[];

    if (options.reelMode === "global") {
      plans = [planReels(sumMm(cableLines.map((l) => l.length.totalMm)), cable.reelLengthsM)];
    } else {
      const byGroup = new Map<string, number>();
      for (const l of cableLines) {
        byGroup.set(l.groupId, (byGroup.get(l.groupId) ?? 0) + l.length.totalMm);
      }
      plans = [...byGroup.values()].map((mm) => planReels(mm, cable.reelLengthsM));
    }

    orders.push({
      cableTypeId,
      cableName: cable.name,
      requiredMm: sumMm(plans.map((p) => p.requiredMm)),
      purchasedMm: sumMm(plans.map((p) => p.purchasedMm)),
      leftoverMm: sumMm(plans.map((p) => p.leftoverMm)),
      reels: mergeReels(plans),
    });
  }

  return { lines, orders };
}
