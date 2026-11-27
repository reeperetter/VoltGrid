import { useEffect, useMemo, useRef, useState } from "react";
import {
  BARRIER_LAYERS,
  KIND_LABEL,
  extractElements,
  routeApartment,
  type ApartmentRoutes,
  type ElementKind,
  type FloorReport,
  type PlanData,
  type PlanElement,
} from "@voltgrid/core";

const KIND_COLOR: Record<ElementKind, string> = {
  tm: "#b91c1c",
  tsm: "#b45309",
  socketSingle: "#2563eb",
  socketDouble: "#1d4ed8",
  cooker3f: "#7c3aed",
  lightOutlet: "#ca8a04",
  switchSingle: "#059669",
  switchDouble: "#047857",
  it: "#0891b2",
  rtv: "#0e7490",
};
const CIRCUIT_COLOR = ["#dc2626", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#be185d", "#65a30d", "#4f46e5", "#0f766e"];
const circuitColor = (c: string) => (c === "TT" ? "#0891b2" : CIRCUIT_COLOR[Number(c) % CIRCUIT_COLOR.length] ?? "#444");

interface Props {
  plan: PlanData;
  report: FloorReport;
  selected: number | undefined;
  onSelect: (index: number | undefined) => void;
}

/** Креслення поверху: панорамування/масштаб, квартири, елементи, підсвічування однакових символів, траси. */
export function PlanView({ plan, report, selected, onSelect }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ s: 0.02, ox: 0, oy: 0 });
  const [kind, setKind] = useState<ElementKind>();
  const [routes, setRoutes] = useState<Record<number, ApartmentRoutes>>({});
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const walls = useMemo(() => plan.lines.filter((l) => BARRIER_LAYERS.includes(l.layer)), [plan]);
  const elements = useMemo<PlanElement[][]>(
    () =>
      report.regions.map((r) =>
        extractElements(
          plan.texts.filter((t) => r.owns(t.x, t.y)),
          plan.inserts.filter((i) => r.owns(i.x, i.y)),
        ),
      ),
    [plan, report],
  );
  const allElements = useMemo(() => elements.flat(), [elements]);

  const bounds = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of report.regions) {
      x0 = Math.min(x0, r.bbox.x0); y0 = Math.min(y0, r.bbox.y0);
      x1 = Math.max(x1, r.bbox.x1); y1 = Math.max(y1, r.bbox.y1);
    }
    return { x0, y0, x1, y1 };
  }, [report]);

  // Початковий вигляд — весь поверх.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !isFinite(bounds.x0)) return;
    const s = Math.min(c.clientWidth / (bounds.x1 - bounds.x0), c.clientHeight / (bounds.y1 - bounds.y0)) * 0.95;
    setView({ s, ox: c.clientWidth / 2 - ((bounds.x0 + bounds.x1) / 2) * s, oy: c.clientHeight / 2 + ((bounds.y0 + bounds.y1) / 2) * s });
  }, [bounds]);

  const toScreen = (x: number, y: number) => ({ x: x * view.s + view.ox, y: -y * view.s + view.oy });

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, c.clientWidth, c.clientHeight);
    g.lineWidth = 1;
    g.strokeStyle = "#9ca3af";
    g.beginPath();
    for (const l of walls) {
      const a = toScreen(l.x1, l.y1);
      const b = toScreen(l.x2, l.y2);
      if ((a.x < 0 && b.x < 0) || (a.y < 0 && b.y < 0) || (a.x > c.clientWidth && b.x > c.clientWidth) || (a.y > c.clientHeight && b.y > c.clientHeight)) continue;
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    g.stroke();
    // Квартири: напівпрозора заливка виділеної.
    report.regions.forEach((r, i) => {
      const m = r.mask;
      const sel = selected === i + 1;
      const p = toScreen(m.x0, m.y0 + m.h * m.cellMm);
      const w = m.w * m.cellMm * view.s;
      const h = m.h * m.cellMm * view.s;
      g.strokeStyle = sel ? "#2563eb" : "#d1d5db";
      g.lineWidth = sel ? 2 : 1;
      g.strokeRect(p.x, p.y, w, h);
      if (view.s > 0.004 || sel) {
        const t = toScreen(r.tm.x, r.tm.y);
        g.fillStyle = sel ? "#2563eb" : "#6b7280";
        g.font = "bold 12px sans-serif";
        g.fillText(String(i + 1), t.x + 6, t.y - 6);
      }
    });
    // Траси вибраної квартири.
    const rt = selected ? routes[selected] : undefined;
    if (rt) {
      for (const leg of rt.legs) {
        g.lineWidth = leg.conduit === 32 ? 4 : leg.conduit === 25 ? 3 : 1.5;
        g.strokeStyle = circuitColor(leg.circuit);
        g.beginPath();
        leg.path.forEach((pt, i) => {
          const s = toScreen(pt.x, pt.y);
          if (i === 0) g.moveTo(s.x, s.y);
          else g.lineTo(s.x, s.y);
        });
        g.stroke();
      }
    }
    // Елементи: усі однотипні з обраним — крупно, решта — тьмяно.
    for (const e of allElements) {
      const s = toScreen(e.x, e.y);
      if (s.x < -10 || s.y < -10 || s.x > c.clientWidth + 10 || s.y > c.clientHeight + 10) continue;
      const hit = kind === e.kind;
      g.globalAlpha = kind && !hit ? 0.25 : 1;
      g.fillStyle = KIND_COLOR[e.kind];
      g.beginPath();
      g.arc(s.x, s.y, hit ? 7 : Math.max(2.5, Math.min(5, view.s * 400)), 0, Math.PI * 2);
      g.fill();
      if (hit) {
        g.strokeStyle = "#111";
        g.lineWidth = 2;
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  });

  const worldAt = (px: number, py: number) => ({ x: (px - view.ox) / view.s, y: -(py - view.oy) / view.s });

  function onClick(ev: React.MouseEvent) {
    const r = canvas.current!.getBoundingClientRect();
    const w = worldAt(ev.clientX - r.left, ev.clientY - r.top);
    const tol = 12 / view.s;
    let best: PlanElement | undefined;
    let bd = tol;
    for (const e of allElements) {
      const d = Math.hypot(e.x - w.x, e.y - w.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      setKind(best.kind);
      return;
    }
    setKind(undefined);
    const idx = report.regions.findIndex((rg) => {
      const m = rg.mask;
      const i = Math.floor((w.x - m.x0) / m.cellMm);
      const j = Math.floor((w.y - m.y0) / m.cellMm);
      return i >= 0 && j >= 0 && i < m.w && j < m.h && m.data[j * m.w + i] === 1;
    });
    onSelect(idx >= 0 ? idx + 1 : undefined);
  }

  function runRouting() {
    if (!selected) return;
    const i = selected - 1;
    const r = report.regions[i]!;
    const win = plan.lines.filter((l) => l.layer.startsWith("A-GLAZ") && r.owns(l.x1, l.y1));
    setRoutes((p) => ({ ...p, [selected]: routeApartment(r.mask, elements[i]!, win) }));
  }

  const countAll = kind ? allElements.filter((e) => e.kind === kind).length : 0;
  const countApt = kind && selected ? elements[selected - 1]!.filter((e) => e.kind === kind).length : 0;
  const rt = selected ? routes[selected] : undefined;

  return (
    <div className="plan-view">
      <canvas
        ref={canvas}
        className="plan-canvas"
        onWheel={(e) => {
          const r = canvas.current!.getBoundingClientRect();
          const px = e.clientX - r.left;
          const py = e.clientY - r.top;
          const k = e.deltaY < 0 ? 1.2 : 1 / 1.2;
          setView((v) => ({ s: v.s * k, ox: px - (px - v.ox) * k, oy: py - (py - v.oy) * k }));
        }}
        onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, moved: false })}
        onMouseMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
          if (d.moved) {
            d.x = e.clientX;
            d.y = e.clientY;
            setView((v) => ({ ...v, ox: v.ox + dx, oy: v.oy + dy }));
          }
        }}
        onMouseUp={(e) => {
          const moved = drag.current?.moved;
          drag.current = null;
          if (!moved) onClick(e);
        }}
        onMouseLeave={() => (drag.current = null)}
      />
      <aside className="plan-side">
        <h3>Легенда (клік по символу — підсвітити такі самі)</h3>
        <ul className="plan-legend">
          {(Object.keys(KIND_LABEL) as ElementKind[]).map((k) => (
            <li key={k} className={kind === k ? "active" : undefined} onClick={() => setKind(kind === k ? undefined : k)}>
              <i style={{ background: KIND_COLOR[k] }} /> {KIND_LABEL[k].uk}
              <b>{allElements.filter((e) => e.kind === k).length}</b>
            </li>
          ))}
        </ul>
        {kind && (
          <p>
            <b>{KIND_LABEL[kind].uk}</b>: на поверсі {countAll}
            {selected ? `, у квартирі ${selected} — ${countApt}` : ""}
          </p>
        )}
        <h3>Квартира {selected ?? "—"}</h3>
        <button disabled={!selected} onClick={runRouting}>Прокласти траси</button>
        {!selected && <p className="floor-hint">Клікніть по квартирі на плані або по рядку таблиці.</p>}
        {rt && (
          <>
            <table className="floor-table">
              <thead>
                <tr><th>Коло</th><th>Ділянок</th><th>Довжина, м</th></tr>
              </thead>
              <tbody>
                {Object.entries(rt.byCircuit).map(([c, v]) => (
                  <tr key={c}>
                    <td><i className="swatch" style={{ background: circuitColor(c) }} /> {c === "TT" ? "TSM→IT/RTV" : `${c}/TM`}</td>
                    <td>{v.legs}</td>
                    <td>{(v.lengthMm / 1000).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th colSpan={2}>Разом</th><th>{(rt.totalMm / 1000).toFixed(1)}</th></tr>
              </tfoot>
            </table>
            <p>
              Труби: fi20 — {(rt.byConduit[20] / 1000).toFixed(1)} м, fi25 — {(rt.byConduit[25] / 1000).toFixed(1)} м, fi32 — {(rt.byConduit[32] / 1000).toFixed(1)} м
              <br />
              <small>(товщина лінії на плані: тонка fi20, середня fi25, товста fi32)</small>
            </p>
            {rt.boardNotes.length > 0 && <p className="floor-error">Щит: {rt.boardNotes.join("; ")}</p>}
            {rt.unreached.length > 0 && <p className="floor-error">Не досягнуто: {rt.unreached.join(", ")}</p>}
            <p className="floor-hint">
              Довжини: горизонталь по A* + спуски до висот кріплення + запаси на кінцях/поворотах, +10 %. Тонкі стіни (≤14 см) проходяться свердлінням; біля вікон тримається відступ 20 см.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
