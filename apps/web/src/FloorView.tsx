import { useState } from "react";
import { buildFloorReport, REPORT_COLUMNS, type FloorReport } from "@voltgrid/core";
import { downloadBytes } from "./lib/files";
import { readDwgPlan } from "./lib/dwg";
import { readPdfPlan } from "./lib/pdfPlan";
import { buildFloorXlsx } from "./lib/exportFloorXlsx";

/** Екран «Поверх з DWG»: квартири визначаються автоматично, компоненти рахуються за підписами на плані. */
export function FloorView() {
  const [report, setReport] = useState<FloorReport>();
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(100);
  const [isPdf, setIsPdf] = useState(false);
  const [error, setError] = useState<string>();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setReport(undefined);
    try {
      const pdf = /\.pdf$/i.test(file.name);
      setIsPdf(pdf);
      const plan = pdf ? await readPdfPlan(await file.arrayBuffer(), scale) : await readDwgPlan(file);
      // Дрібна пауза, щоб браузер встиг показати «Розбираю…» перед важким розрахунком.
      await new Promise((r) => setTimeout(r, 30));
      setReport(buildFloorReport(plan));
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    if (!report) return;
    const bytes = await buildFloorXlsx(report, fileName);
    downloadBytes(
      fileName.replace(/\.dwg$/i, "") + "-mieszkania.xlsx",
      bytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  const totals = report
    ? REPORT_COLUMNS.map((c) => report.apartments.reduce((s, a) => s + c.value(a.counts), 0))
    : [];

  return (
    <div className="floor-view">
      <div className="floor-actions">
        <label className="button">
          Відкрити план поверху (DWG / PDF)
          <input
            type="file"
            accept=".dwg,.pdf,application/pdf"
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label title="Для PDF: 100 означає масштаб 1:100">
          Масштаб PDF 1:
          <input
            type="number"
            min={1}
            max={5000}
            value={scale}
            style={{ width: 70, marginLeft: 4 }}
            onChange={(e) => setScale(Math.max(1, Number(e.target.value) || 100))}
          />
        </label>
        <button onClick={() => void onExport()} disabled={!report}>Експорт у Excel</button>
        {busy && <span>Розбираю креслення… (великий файл — до пів хвилини)</span>}
        {report && (
          <span>
            {fileName}: квартир {report.apartments.length}
          </span>
        )}
      </div>
      {error && <p className="floor-error">{error}</p>}
      {report && isPdf && (
        <p className="floor-warnings">
          Джерело — PDF: символи без підпису (домофонна трубка, датчик диму, настінні виводи світла) не розпізнаються, тож ці стовпці можуть бути
          нульовими. Точніший результат дає DWG.
        </p>
      )}
      {report && report.warnings.length > 0 && (
        <ul className="floor-warnings">
          {report.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {report && (
        <div className="floor-table-wrap">
          <table className="floor-table">
            <thead>
              <tr>
                <th>№</th>
                <th>м²</th>
                {REPORT_COLUMNS.map((c) => (
                  <th key={c.key} title={c.label}>{c.hint}</th>
                ))}
                <th>Увага</th>
              </tr>
            </thead>
            <tbody>
              {report.apartments.map((a) => (
                <tr key={a.index} className={a.warnings.length ? "has-warning" : undefined}>
                  <td>{a.index}</td>
                  <td>{a.areaM2.toFixed(1)}</td>
                  {REPORT_COLUMNS.map((c) => (
                    <td key={c.key}>{c.value(a.counts)}</td>
                  ))}
                  <td>{a.warnings.join("; ")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>Разом</th>
                {totals.map((t, i) => (
                  <th key={i}>{t}</th>
                ))}
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {!report && !busy && !error && (
        <p className="floor-hint">
          Відкрийте DWG електричного плану поверху (Revit-експорт із шарами _E_GNIAZDA, _E_OŚW, _E_TABLICE) або векторний PDF (тоді вкажіть масштаб). Програма сама
          знайде квартири за стінами та порахує компоненти за підписами на плані. Малювати нічого не потрібно; докладніше — у довідці (F1).
        </p>
      )}
    </div>
  );
}
