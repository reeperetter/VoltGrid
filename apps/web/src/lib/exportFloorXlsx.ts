import { DEFAULT_BOARD, REPORT_COLUMNS, type ApartmentRoutes, type FloorReport } from "@voltgrid/core";

/** Книга Excel зі зведенням компонентів по квартирах поверху. */
export async function buildFloorXlsx(report: FloorReport, sourceName: string, routes: Record<number, ApartmentRoutes> = {}): Promise<Uint8Array> {
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

  const routed = report.apartments.filter((a) => routes[a.index]);
  if (routed.length > 0) {
    const circuits = DEFAULT_BOARD.filter((b) => Number(b.id) <= 9).map((b) => b.id);
    const wt = wb.addWorksheet("Trasy");
    wt.columns = [
      { header: "Nr", width: 6 },
      ...circuits.map((c) => ({ header: `Obwód ${c}/TM, m`, width: 12 })),
      { header: "TSM→IT/RTV, m", width: 14 },
      { header: "Kable razem, m", width: 14 },
      { header: "Rura fi20, m", width: 12 },
      { header: "Rura fi25, m", width: 12 },
      { header: "Rura fi32, m", width: 12 },
      { header: "Przewierty", width: 11 },
      { header: "Uwagi", width: 60 },
    ];
    wt.getRow(1).alignment = { wrapText: true, vertical: "middle" };
    wt.getRow(1).font = { bold: true };
    wt.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
    const m = (mm: number) => Number((mm / 1000).toFixed(1));
    for (const a of routed) {
      const r = routes[a.index]!;
      wt.addRow([
        a.index,
        ...circuits.map((c) => m(r.byCircuit[c]?.lengthMm ?? 0)),
        m(r.byCircuit["TT"]?.lengthMm ?? 0),
        m(r.totalMm),
        m(r.byConduit[20]),
        m(r.byConduit[25]),
        m(r.byConduit[32]),
        r.legs.reduce((s, l) => s + l.drills, 0),
        [...r.boardNotes, ...r.unreached.map((u) => `nie osiągnięto: ${u}`)].join("; "),
      ]);
    }
    const n = routed.length + 1;
    const tot: (string | { formula: string })[] = ["Razem"];
    for (let c = 2; c <= circuits.length + 6; c++) {
      const col = wt.getColumn(c).letter;
      tot.push({ formula: `SUM(${col}2:${col}${n})` });
    }
    wt.addRow(tot).font = { bold: true };
  }

  const info = wb.addWorksheet("Informacje");
  info.columns = [{ width: 28 }, { width: 80 }];
  info.addRow(["Plik źródłowy", sourceName]);
  info.addRow(["Liczba mieszkań", report.apartments.length]);
  for (const w of report.warnings) info.addRow(["Ostrzeżenie", w]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
