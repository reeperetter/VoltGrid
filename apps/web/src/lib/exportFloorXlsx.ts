import { REPORT_COLUMNS, type FloorReport } from "@voltgrid/core";

/** Книга Excel зі зведенням компонентів по квартирах поверху. */
export async function buildFloorXlsx(report: FloorReport, sourceName: string): Promise<Uint8Array> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  wb.creator = "VoltGrid";
  const ws = wb.addWorksheet("Mieszkania");
  ws.columns = [
    { header: "Nr", width: 6 },
    { header: "Powierzchnia, m²", width: 16 },
    ...REPORT_COLUMNS.map((c) => ({ header: c.label, width: 18 })),
    { header: "Uwagi", width: 60 },
  ];
  ws.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  for (const a of report.apartments) {
    ws.addRow([a.index, Number(a.areaM2.toFixed(1)), ...REPORT_COLUMNS.map((c) => c.value(a.counts)), a.warnings.join("; ")]);
  }
  const first = 2;
  const last = report.apartments.length + 1;
  const totals: (string | number | { formula: string })[] = ["Razem", ""];
  REPORT_COLUMNS.forEach((_, i) => {
    const col = String.fromCharCode("C".charCodeAt(0) + i);
    totals.push({ formula: `SUM(${col}${first}:${col}${last})` });
  });
  const row = ws.addRow(totals);
  row.font = { bold: true };

  const info = wb.addWorksheet("Informacje");
  info.columns = [{ width: 28 }, { width: 80 }];
  info.addRow(["Plik źródłowy", sourceName]);
  info.addRow(["Liczba mieszkań", report.apartments.length]);
  for (const w of report.warnings) info.addRow(["Ostrzeżenie", w]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
