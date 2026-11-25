import type { RegionProfile } from "@voltgrid/regions";
import { calcProjectCables, type ReelMode } from "./order";
import { RISER_GROUP_ID, RISER_GROUP_NAME } from "./riser";
import type { ElectricalPointKind, Project } from "./project";

export interface BomRow {
  section: "Кабель" | "Бухти" | "Точки" | "Кола";
  name: string;
  unit: string;
  quantity: number;
  note: string;
}

const POINT_NAMES: Record<ElectricalPointKind, string> = {
  board: "Електрощит",
  socket: "Розетка",
  switch: "Вимикач",
  light: "Світильник (точка)",
  appliance: "Прилад",
  data: "Слабкострумова точка",
};

const POINT_ORDER: ElectricalPointKind[] = ["board", "socket", "switch", "light", "appliance", "data"];

const toMeters = (mm: number) => Math.round(mm) / 1000;

/**
 * Специфікація проєкту: кабель (потрібно / бухти), кількість точок за видами, зведення за колами.
 * Лише те, що вже рахується в моделі; рамки, коробки, Wago тощо — після уточнення методики.
 */
export function buildBom(project: Project, region: RegionProfile, reelMode: ReelMode): BomRow[] {
  const rows: BomRow[] = [];
  const calc = calcProjectCables(project, region, { reelMode });

  for (const o of calc.orders) {
    rows.push({
      section: "Кабель",
      name: o.cableName,
      unit: "м",
      quantity: toMeters(o.requiredMm),
      note: `з запасом ${region.defaultReservePercent}%; залишок бухт ${String(toMeters(o.leftoverMm)).replace(".", ",")} м`,
    });
    for (const r of o.reels) {
      rows.push({
        section: "Бухти",
        name: `${o.cableName} — бухта ${r.lengthM} м`,
        unit: "шт",
        quantity: r.count,
        note: reelMode === "global" ? "спільно на проєкт" : "окремо для кожного кола",
      });
    }
  }

  for (const kind of POINT_ORDER) {
    const count = project.points.filter((p) => p.kind === kind).length;
    if (count > 0) rows.push({ section: "Точки", name: POINT_NAMES[kind], unit: "шт", quantity: count, note: "" });
  }

  const groups = [...project.groups, ...(project.risers.length > 0 ? [{ id: RISER_GROUP_ID, name: RISER_GROUP_NAME }] : [])];
  for (const group of groups) {
    const lines = calc.lines.filter((l) => l.groupId === group.id);
    if (lines.length === 0) continue;
    const total = lines.reduce((s, l) => s + l.length.totalMm, 0);
    const cable = region.cableTypes.find((c) => c.id === lines[0]?.cableTypeId);
    rows.push({
      section: "Кола",
      name: group.name,
      unit: "м",
      quantity: toMeters(total),
      note: `${cable?.name ?? "?"}; ліній: ${lines.length}`,
    });
  }
  return rows;
}

function csvCell(value: string | number): string {
  const s = typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV для Excel: роздільник «;», десяткова кома, BOM для кирилиці. */
export function bomToCsv(rows: readonly BomRow[]): string {
  const header = ["Розділ", "Назва", "Од.", "Кількість", "Примітка"];
  const lines = [header, ...rows.map((r) => [r.section, r.name, r.unit, r.quantity, r.note])];
  return "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
