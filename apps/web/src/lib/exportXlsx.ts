import {
  buildBom,
  buildCheckReport,
  calcProjectCables,
  RISER_GROUP_ID,
  RISER_GROUP_NAME,
  type Project,
  type ReelMode,
} from "@voltgrid/core";
import type { RegionProfile } from "@voltgrid/regions";

const SEVERITY_LABELS = { ok: "OK", info: "Інфо", warn: "Увага", error: "Помилка" } as const;

/** Формує книгу Excel: «Специфікація», «Лінії», «Перевірки». exceljs підвантажується лише при експорті. */
export async function buildXlsx(project: Project, region: RegionProfile, reelMode: ReelMode): Promise<Uint8Array> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  wb.creator = "VoltGrid";

  const bom = wb.addWorksheet("Специфікація");
  bom.columns = [
    { header: "Розділ", width: 12 },
    { header: "Назва", width: 38 },
    { header: "Од.", width: 6 },
    { header: "Кількість", width: 12 },
    { header: "Примітка", width: 50 },
  ];
  for (const r of buildBom(project, region, reelMode)) bom.addRow([r.section, r.name, r.unit, r.quantity, r.note]);

  const calc = calcProjectCables(project, region, { reelMode });
  const groupName = new Map<string, string>([
    ...project.groups.map((g): [string, string] => [g.id, g.name]),
    [RISER_GROUP_ID, RISER_GROUP_NAME],
  ]);
  const cableName = new Map(region.cableTypes.map((c) => [c.id, c.name]));
  const lines = wb.addWorksheet("Лінії");
  lines.columns = [
    { header: "Лінія", width: 8 },
    { header: "Коло", width: 20 },
    { header: "Кабель", width: 16 },
    { header: "Горизонталь, м", width: 15 },
    { header: "Вертикаль, м", width: 14 },
    { header: "Обхід, м", width: 10 },
    { header: "Запас, м", width: 10 },
    { header: "Разом, м", width: 10 },
  ];
  const m = (mm: number) => mm / 1000;
  for (const l of calc.lines) {
    lines.addRow([
      l.lineId,
      groupName.get(l.groupId) ?? l.groupId,
      cableName.get(l.cableTypeId) ?? l.cableTypeId,
      m(l.length.horizontalMm),
      m(l.length.verticalMm),
      m(l.length.detourMm),
      m(l.length.reserveMm),
      m(l.length.totalMm),
    ]);
  }

  const checks = wb.addWorksheet("Перевірки");
  checks.columns = [
    { header: "Статус", width: 10 },
    { header: "Перевірка", width: 70 },
  ];
  for (const c of buildCheckReport(project, region)) checks.addRow([SEVERITY_LABELS[c.severity], c.text]);

  for (const ws of wb.worksheets) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
