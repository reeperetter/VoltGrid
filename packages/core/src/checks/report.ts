import type { RegionProfile } from "@voltgrid/regions";
import { calcLineLength } from "../length";
import type { Project } from "../project";
import { checkOverload } from "./overload";
import { balancePhases } from "./phaseBalance";
import { checkVoltageDrop } from "./voltageDrop";

export type Severity = "ok" | "info" | "warn" | "error";

export interface CheckItem {
  groupId?: string;
  check: "voltageDrop" | "overload" | "phaseBalance";
  severity: Severity;
  text: string;
}

/** Потужність і струм кола: задані користувачем мають пріоритет, інакше — типові норми профілю (чернетка). */
export function effectiveLoad(
  project: Project,
  groupId: string,
  region: RegionProfile,
): { powerW: number | undefined; currentA: number | undefined; typical: boolean } {
  const group = project.groups.find((g) => g.id === groupId);
  const t = region.typicalLoads;
  const typicalPower =
    project.points
      .filter((p) => p.groupId === groupId)
      .reduce((s, p) => s + (t.pointPowerW[p.kind] ?? 0), 0) * t.simultaneityFactor;
  const powerW = group?.powerW ?? (typicalPower > 0 ? typicalPower : undefined);
  const currentA =
    group?.designCurrentA ?? (powerW !== undefined ? powerW / (t.phaseVoltageV * t.powerFactor) : undefined);
  const typical = group?.designCurrentA === undefined && currentA !== undefined;
  return { powerW, currentA, typical };
}

const fmt = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

/**
 * Зведений звіт перевірок кіл. Чого не вистачає для розрахунку — повідомляється як «info»,
 * а не вгадується. ΔU рахується консервативно: весь струм кола на всій довжині ланцюжка.
 */
export function buildCheckReport(project: Project, region: RegionProfile): CheckItem[] {
  const items: CheckItem[] = [];
  const cableById = new Map(region.cableTypes.map((c) => [c.id, c]));

  for (const group of project.groups) {
    const lines = project.lines.filter((l) => l.groupId === group.id);
    if (lines.length === 0) continue;
    const cable = cableById.get(lines[0]!.cableTypeId);
    const prefix = `Коло «${group.name}»: `;

    // ΔU
    const load = effectiveLoad(project, group.id, region);
    const ib = load.currentA;
    const note = load.typical ? " [Ib за типовими нормами, чернетка]" : "";
    if (ib === undefined) {
      items.push({ groupId: group.id, check: "voltageDrop", severity: "info", text: `${prefix}не задано розрахунковий струм — ΔU не перевірено.` });
    } else if (!cable?.crossSectionMm2) {
      items.push({ groupId: group.id, check: "voltageDrop", severity: "info", text: `${prefix}для кабелю не відомий переріз — ΔU не перевірено.` });
    } else {
      const baseMm = lines.reduce((s, l) => s + calcLineLength(l.segments, 0).baseMm, 0);
      const pointKinds = new Set(project.points.filter((p) => p.groupId === group.id).map((p) => p.kind));
      const lighting = pointKinds.size > 0 && [...pointKinds].every((k) => k === "light" || k === "switch");
      const r = checkVoltageDrop(
        { currentA: ib, lengthMm: baseMm, crossSectionMm2: cable.crossSectionMm2, phases: 1, loadKind: lighting ? "lighting" : "other" },
        region,
      );
      const text = `${prefix}ΔU = ${fmt(r.dropPercent)} % (${fmt(r.dropV)} В, ${fmt(baseMm / 1000, 1)} м, Ib ${fmt(ib, 1)} А)${note}`;
      if (r.status === "noLimit") items.push({ groupId: group.id, check: "voltageDrop", severity: "info", text: `${text}; межу не задано в профілі.` });
      else if (r.status === "exceeded") items.push({ groupId: group.id, check: "voltageDrop", severity: "error", text: `${text} перевищує межу ${fmt(r.limitPercent ?? 0, 1)} %.` });
      else items.push({ groupId: group.id, check: "voltageDrop", severity: "ok", text: `${text} — у межах ${fmt(r.limitPercent ?? 0, 1)} %.` });
    }

    // Перевантаження
    if (ib === undefined || group.breakerA === undefined || group.cableCapacityA === undefined) {
      items.push({ groupId: group.id, check: "overload", severity: "info", text: `${prefix}для перевірки на перевантаження потрібні Ib, In автомата та Iz кабелю.` });
    } else {
      const r = checkOverload({ designCurrentA: ib, ratedCurrentA: group.breakerA, cableCapacityA: group.cableCapacityA });
      items.push({
        groupId: group.id,
        check: "overload",
        severity: r.ok ? "ok" : "error",
        text: r.ok
          ? `${prefix}захист від перевантаження: умови Ib ≤ In ≤ Iz та I2 ≤ 1,45·Iz виконано.`
          : `${prefix}захист від перевантаження не виконано (${!r.condition1 ? "Ib ≤ In ≤ Iz" : ""}${!r.condition1 && !r.condition2 ? "; " : ""}${!r.condition2 ? "I2 ≤ 1,45·Iz" : ""}).`,
      });
    }
  }

  // Баланс фаз (за заданою потужністю кіл)
  const powered = project.groups
    .map((g) => ({ id: g.id, powerW: effectiveLoad(project, g.id, region).powerW ?? 0 }))
    .filter((g) => g.powerW > 0);
  if (powered.length >= 2) {
    const r = balancePhases(powered);
    const severity: Severity = r.maxDeviationPercent > 20 ? "warn" : "ok";
    items.push({
      check: "phaseBalance",
      severity,
      text: `Баланс фаз: L1 ${r.totalsW[0]} Вт, L2 ${r.totalsW[1]} Вт, L3 ${r.totalsW[2]} Вт; найбільше відхилення ${fmt(r.maxDeviationPercent, 1)} % від середнього.`,
    });
  }
  return items;
}
