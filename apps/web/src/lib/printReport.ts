import { buildBom, buildCheckReport, type Project, type ReelMode } from "@voltgrid/core";
import type { RegionProfile } from "@voltgrid/regions";

const esc = (s: string | number) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** Друкована сторінка зі специфікацією й перевірками; «Зберегти як PDF» — у діалозі друку браузера. */
export function buildReportHtml(project: Project, region: RegionProfile, reelMode: ReelMode): string {
  const rows = buildBom(project, region, reelMode);
  const checks = buildCheckReport(project, region);
  const sevLabel = { ok: "OK", info: "Інфо", warn: "Увага", error: "Помилка" } as const;
  const bomRows = rows
    .map((r) => `<tr><td>${esc(r.section)}</td><td>${esc(r.name)}</td><td>${esc(r.unit)}</td><td class="n">${esc(String(r.quantity).replace(".", ","))}</td><td>${esc(r.note)}</td></tr>`)
    .join("");
  const checkRows = checks
    .map((c) => `<tr class="${c.severity}"><td>${sevLabel[c.severity]}</td><td>${esc(c.text)}</td></tr>`)
    .join("");
  const draft = region.status === "draft" ? `<p class="draft">Профіль регіону «${esc(region.id)}» має статус «чернетка»: норми не звірено.</p>` : "";
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${esc(project.name)} — звіт</title>
<style>
body{font:13px/1.4 system-ui,sans-serif;margin:24px;color:#111}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:3px 6px;text-align:left;vertical-align:top}
th{background:#f1f5f9}.n{text-align:right}.draft{color:#b45309}
tr.error td:first-child{color:#b91c1c;font-weight:600}tr.warn td:first-child{color:#b45309}tr.ok td:first-child{color:#047857}
@media print{body{margin:10mm}}
</style></head><body>
<h1>${esc(project.name)}</h1>
<div>Регіон: ${esc(region.id)} · Бухти: ${reelMode === "global" ? "спільно на проєкт" : "окремо для кожного кола"}</div>
${draft}
<h2>Специфікація</h2>
<table><thead><tr><th>Розділ</th><th>Назва</th><th>Од.</th><th>Кількість</th><th>Примітка</th></tr></thead><tbody>${bomRows}</tbody></table>
<h2>Перевірки</h2>
<table><thead><tr><th>Статус</th><th>Результат</th></tr></thead><tbody>${checkRows || '<tr><td colspan="2">Немає даних</td></tr>'}</tbody></table>
</body></html>`;
}

export function openPrintableReport(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}
