import { useState } from "react";
import { buildFloorReport, REPORT_COLUMNS, type FloorReport } from "@voltgrid/core";
import { downloadBytes } from "./lib/files";
import { readDwgPlan } from "./lib/dwg";
import { buildFloorXlsx } from "./lib/exportFloorXlsx";

/** Екран «Поверх з DWG»: квартири визначаються автоматично, компоненти рахуються за підписами на плані. */
export function FloorView() {
  const [report, setReport] = useState<FloorReport>();
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setReport(undefined);
    try {
      const plan = await readDwgPlan(file);
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
          Відкрити DWG поверху
          <input
            type="file"
            accept=".dwg"
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
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
          Відкрийте DWG електричного плану поверху (Revit-експорт із шарами _E_GNIAZDA, _E_OŚW, _E_TABLICE). Програма сама
          знайде квартири за стінами й вхідними дверима та порахує компоненти за підписами на плані.
        </p>
      )}
    </div>
  );
}
