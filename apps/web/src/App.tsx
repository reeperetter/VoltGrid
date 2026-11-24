import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addGroup,
  bomToCsv,
  buildBom,
  addLevel,
  addOpeningAt,
  addPoint,
  addWall,
  canRedo,
  calcProjectCables,
  canUndo,
  commit,
  createEmptyProject,
  createHistory,
  createSamplePlan,
  distanceMm,
  mmPerPxFromDrawingScale,
  movePoint,
  parseProject,
  planLevelRoutes,
  redo,
  removeById,
  removeGroup,
  replaceLevelLines,
  rescaleMmPerPx,
  serializeProject,
  setGroupCable,
  setLinePath,
  setLevelUnderlay,
  setPointGroup,
  undo,
  type PointMm,
  type ReelMode,
  type Project,
  type WallMaterial,
} from "@voltgrid/core";
import { getRegionProfile } from "@voltgrid/regions";
import { EditorCanvas } from "./editor/EditorCanvas";
import {
  DEFAULT_OPTIONS,
  DEFAULT_TOOL_PARAMS,
  GROUP_COLORS,
  POINT_KIND_LABELS,
  WALL_MATERIAL_LABELS,
  type CalibrationState,
  type EditorOptions,
  type LoadedUnderlay,
  type PlacedPointKind,
  type Tool,
  type ToolParams,
} from "./editor/types";
import { downloadText, readFileText, safeFileName } from "./lib/files";
import { guessMmPerPx, loadUnderlay } from "./lib/underlay";

const REGION_ID = "pl";

function newProject(): Project {
  const empty = createEmptyProject({ id: "new", name: "Новий проєкт", regionId: REGION_ID });
  return addLevel(empty, { name: "1-й поверх", ceilingHeightMm: 2700 }).project;
}

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "select", label: "Вибір", hint: "Виділити й перетягнути точку; Delete — видалити" },
  { id: "pan", label: "Рука", hint: "Переміщення полотна (також Пробіл + перетягування)" },
  { id: "calibrate", label: "Калібрування", hint: "Позначте два точки на кресленні й введіть фактичну довжину" },
  { id: "wall", label: "Стіна", hint: "Клік — початок, клік — кінець; Esc або права кнопка — завершити" },
  { id: "door", label: "Двері", hint: "Клік по стіні" },
  { id: "window", label: "Вікно", hint: "Клік по стіні" },
  { id: "board", label: "Щит", hint: "Клік на плані — розмістити електрощит" },
  { id: "socket", label: "Розетка", hint: "Клік на плані" },
  { id: "switch", label: "Вимикач", hint: "Клік на плані" },
  { id: "light", label: "Світильник", hint: "Клік на плані" },
];

function toNumber(value: string, fallback: number): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function App() {
  const [history, setHistory] = useState(() => createHistory(newProject()));
  const project = history.present;
  const region = useMemo(() => getRegionProfile(project.regionId), [project.regionId]);

  const [activeLevelId, setActiveLevelId] = useState(() => project.levels[0]?.id ?? "");
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [options, setOptions] = useState<EditorOptions>(DEFAULT_OPTIONS);
  const [toolParams, setToolParams] = useState<ToolParams>(DEFAULT_TOOL_PARAMS);
  const [underlays, setUnderlays] = useState<Record<string, LoadedUnderlay>>({});
  const [calibration, setCalibration] = useState<CalibrationState>({});
  const [realLength, setRealLength] = useState("");
  const [lengthUnit, setLengthUnit] = useState<"mm" | "m">("m");
  const [drawingScale, setDrawingScale] = useState("100");
  const [fitSignal, setFitSignal] = useState(0);
  const [activeGroupId, setActiveGroupId] = useState<string | undefined>();
  const [reelMode, setReelMode] = useState<ReelMode>("global");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState("Готово до роботи.");
  const [cursorInfo, setCursorInfo] = useState<{ p: PointMm; scale: number } | undefined>();

  const level = project.levels.find((l) => l.id === activeLevelId) ?? project.levels[0];
  const levelId = level?.id ?? "";
  const loadedUnderlay = underlays[levelId];
  const underlayMmPerPx = level?.underlay?.mmPerPx;

  /** Застосовує зміну моделі до історії. */
  const apply = useCallback((fn: (p: Project) => Project) => {
    setHistory((h) => commit(h, fn(h.present)));
  }, []);

  const doUndo = useCallback(() => setHistory((h) => undo(h)), []);
  const doRedo = useCallback(() => setHistory((h) => redo(h)), []);

  // Гарячі клавіші: Delete, Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        apply((p) => removeById(p, selectedId));
        setSelectedId(undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, doRedo, doUndo, selectedId]);

  // Якщо виділений елемент зник (undo, видалення стіни) — знімаємо виділення.
  useEffect(() => {
    if (!selectedId) return;
    const exists =
      project.walls.some((w) => w.id === selectedId) ||
      project.openings.some((o) => o.id === selectedId) ||
      project.points.some((p) => p.id === selectedId) ||
      project.lines.some((l) => l.id === selectedId);
    if (!exists) setSelectedId(undefined);
  }, [project, selectedId]);

  const chooseTool = (next: Tool) => {
    setTool(next);
    if (next !== "calibrate") setCalibration({});
    if (next === "calibrate" && !loadedUnderlay) {
      setStatus("Спершу додайте креслення (PDF або зображення) для цього поверху.");
    }
  };

  const onAddWall = (start: PointMm, end: PointMm) => {
    const result = addWall(project, {
      levelId,
      start,
      end,
      thicknessMm: toolParams.wallThicknessMm,
      material: toolParams.wallMaterial,
    });
    setHistory((h) => commit(h, result.project));
  };

  const onAddPoint = (kind: PlacedPointKind, at: PointMm) => {
    const heightMm =
      kind === "board"
        ? region.mountingHeightsMm.board
        : kind === "socket"
        ? region.mountingHeightsMm.socket
        : kind === "switch"
          ? region.mountingHeightsMm.switch
          : (level?.ceilingHeightMm ?? 2700);
    const groupId = kind !== "board" && activeGroupId && project.groups.some((g) => g.id === activeGroupId) ? activeGroupId : undefined;
    const result = addPoint(project, { levelId, kind, at, heightMm, ...(groupId ? { groupId } : {}) });
    setHistory((h) => commit(h, result.project));
    setSelectedId(result.id);
  };

  const onAddOpening = (kind: "door" | "window", at: PointMm, maxDistanceMm: number) => {
    const params = toolParams[kind];
    const result = addOpeningAt(project, { levelId, kind, at, maxDistanceMm, ...params });
    if (!result) {
      setStatus("Отвір не додано: поруч немає стіни або стіна коротша за отвір.");
      return;
    }
    setHistory((h) => commit(h, result.project));
    setSelectedId(result.id);
    setStatus("Отвір додано.");
  };

  const onCalibrationPoint = (p: PointMm) => {
    setCalibration((c) => (!c.a || c.b ? { a: p } : { a: c.a, b: p }));
  };

  const applyCalibration = () => {
    if (!calibration.a || !calibration.b || !underlayMmPerPx) return;
    const measured = distanceMm(calibration.a, calibration.b);
    const entered = toNumber(realLength, 0);
    const realMm = lengthUnit === "m" ? entered * 1000 : entered;
    try {
      const next = rescaleMmPerPx(underlayMmPerPx, measured, realMm);
      const current = level?.underlay;
      if (!current) return;
      apply((p) => setLevelUnderlay(p, levelId, { ...current, mmPerPx: next }));
      setCalibration({});
      setRealLength("");
      setTool("select");
      setFitSignal((n) => n + 1);
      setStatus(`Масштаб відкалібровано: ${next.toFixed(3)} мм/піксель.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Не вдалося відкалібрувати масштаб.");
    }
  };

  const applyDrawingScale = () => {
    const current = level?.underlay;
    if (!current || !loadedUnderlay?.pxPerPdfPoint) return;
    try {
      const denominator = Math.round(toNumber(drawingScale, 0));
      const next = mmPerPxFromDrawingScale(denominator, loadedUnderlay.pxPerPdfPoint);
      apply((p) => setLevelUnderlay(p, levelId, { ...current, mmPerPx: next }));
      setFitSignal((n) => n + 1);
      setStatus(`Масштаб креслення 1:${denominator} застосовано: ${next.toFixed(3)} мм/піксель. Перевірте його калібруванням за відомим розміром.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Не вдалося застосувати масштаб.");
    }
  };

  const onPickUnderlay = async (file: File | undefined) => {
    if (!file || !level) return;
    setStatus("Завантажую креслення…");
    try {
      const loaded = await loadUnderlay(file, (numPages) => {
        const answer = window.prompt(`У PDF ${numPages} сторінок. Яку використати? (1–${numPages})`, "1");
        if (answer === null) return undefined;
        const n = Math.round(toNumber(answer, 1));
        return Math.min(numPages, Math.max(1, n));
      });
      setUnderlays((u) => ({ ...u, [level.id]: loaded }));
      apply((p) =>
        setLevelUnderlay(p, level.id, { fileName: loaded.fileName, mmPerPx: guessMmPerPx(loaded.widthPx) }),
      );
      setFitSignal((n) => n + 1);
      setStatus("Креслення додано з орієнтовним масштабом. Відкалібруйте його перед малюванням.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Не вдалося завантажити креслення.");
    }
  };

  const removeUnderlay = () => {
    if (!level) return;
    setUnderlays((u) => {
      const { [level.id]: _removed, ...rest } = u;
      return rest;
    });
    apply((p) => setLevelUnderlay(p, level.id, undefined));
    setCalibration({});
  };

  const onAddGroup = () => {
    const result = addGroup(project, { name: `Коло ${project.groups.length + 1}` });
    setHistory((h) => commit(h, result.project));
    setActiveGroupId(result.id);
  };

  const onBuildRoutes = () => {
    try {
      const plan = planLevelRoutes(project, region, levelId);
      apply((p) => replaceLevelLines(p, levelId, plan.lines));
      setWarnings(plan.warnings);
      setStatus(
        plan.lines.length > 0
          ? `Побудовано ліній: ${plan.lines.length}.${plan.warnings.length ? " Є попередження." : ""}`
          : "Лінії не побудовано.",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Не вдалося побудувати траси.");
    }
  };

  const onExportBom = () => {
    try {
      const rows = buildBom(project, region, reelMode);
      downloadText(`${safeFileName(project.name)}-специфікація.csv`, bomToCsv(rows), "text/csv;charset=utf-8");
      setStatus(`Специфікацію збережено: рядків ${rows.length}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Не вдалося сформувати специфікацію.");
    }
  };

  const onAddLevel = () => {
    const result = addLevel(project, {
      name: `${project.levels.length + 1}-й поверх`,
      ceilingHeightMm: level?.ceilingHeightMm ?? 2700,
    });
    setHistory((h) => commit(h, result.project));
    setActiveLevelId(result.id);
  };

  const onSave = () => {
    try {
      downloadText(`${safeFileName(project.name)}.voltgrid.json`, serializeProject(project));
      setStatus("Проєкт збережено у файл. Креслення-підкладки у файл не входять.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Не вдалося зберегти проєкт.");
    }
  };

  const onOpen = async (file: File | undefined) => {
    if (!file) return;
    try {
      const opened = parseProject(await readFileText(file));
      setHistory(createHistory(opened));
      setActiveLevelId(opened.levels[0]?.id ?? "");
      setUnderlays({});
      setSelectedId(undefined);
      setCalibration({});
      setFitSignal((n) => n + 1);
      setStatus(`Відкрито: ${opened.name}. Креслення-підкладки потрібно додати знову.`);
    } catch (err) {
      setStatus(`Не вдалося відкрити файл: ${err instanceof Error ? err.message : "невідома помилка"}`);
    }
  };

  const onNew = () => {
    const fresh = newProject();
    setHistory(createHistory(fresh));
    setActiveLevelId(fresh.levels[0]?.id ?? "");
    setUnderlays({});
    setSelectedId(undefined);
    setCalibration({});
    setFitSignal((n) => n + 1);
    setStatus("Створено новий проєкт.");
  };

  const onLoadSample = () => {
    const sample = createSamplePlan(region);
    setHistory(createHistory(sample));
    setActiveLevelId(sample.levels[0]?.id ?? "");
    setUnderlays({});
    setSelectedId(undefined);
    setCalibration({});
    setFitSignal((n) => n + 1);
    setStatus("Завантажено синтетичний тестовий план.");
  };

  const selectedWall = project.walls.find((w) => w.id === selectedId);
  const selectedOpening = project.openings.find((o) => o.id === selectedId);
  const selectedLine = project.lines.find((l) => l.id === selectedId);
  const selectedPoint = project.points.find((p) => p.id === selectedId);
  const levelWalls = project.walls.filter((w) => w.levelId === levelId);
  const levelPoints = project.points.filter((p) => p.levelId === levelId);
  const levelOpenings = project.openings.filter((o) => levelWalls.some((w) => w.id === o.wallId));
  const calc = useMemo(() => {
    if (project.lines.length === 0) return undefined;
    try {
      return calcProjectCables(project, region, { reelMode });
    } catch {
      return undefined;
    }
  }, [project, region, reelMode]);
  const selectedPointGroupId = selectedPoint?.groupId ?? "";
  const calibrationReady = !!calibration.a && !!calibration.b;
  const measuredMm =
    calibration.a && calibration.b ? Math.round(distanceMm(calibration.a, calibration.b)) : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <strong className="brand">VoltGrid</strong>
        <input
          className="project-name"
          value={project.name}
          aria-label="Назва проєкту"
          onChange={(e) => {
            const name = e.target.value;
            if (name.trim().length > 0) apply((p) => ({ ...p, name }));
          }}
        />
        <div className="topbar-actions">
          <button onClick={onNew}>Новий</button>
          <label className="button">
            Відкрити
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                void onOpen(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={onSave}>Зберегти</button>
          <button onClick={onLoadSample}>Тестовий план</button>
          <span className="sep" />
          <button onClick={doUndo} disabled={!canUndo(history)} title="Ctrl+Z">Назад</button>
          <button onClick={doRedo} disabled={!canRedo(history)} title="Ctrl+Y">Вперед</button>
          <button onClick={() => setFitSignal((n) => n + 1)}>Показати все</button>
        </div>
      </header>

      <div className="workspace">
        <nav className="toolbar" aria-label="Інструменти">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? "tool active" : "tool"}
              title={t.hint}
              onClick={() => chooseTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <main className="canvas-wrap">
          {level ? (
            <EditorCanvas
              project={project}
              levelId={levelId}
              underlay={loadedUnderlay}
              underlayMmPerPx={underlayMmPerPx}
              tool={tool}
              options={options}
              selectedId={selectedId}
              calibration={calibration}
              fitSignal={fitSignal}
              onAddWall={onAddWall}
              onAddPoint={onAddPoint}
              onAddOpening={onAddOpening}
              activeGroupId={activeGroupId}
              onSelect={setSelectedId}
              onEditLinePath={(id, path) => apply((p) => setLinePath(p, id, path))}
              onMovePoint={(id, to) => apply((p) => movePoint(p, id, to))}
              onCalibrationPoint={onCalibrationPoint}
              onCursor={(p, scale) => setCursorInfo(p ? { p, scale } : undefined)}
            />
          ) : (
            <div className="empty">У проєкті немає поверхів.</div>
          )}
        </main>

        <aside className="panel">
          <section>
            <h3>Поверхи</h3>
            <div className="levels">
              {project.levels.map((l) => (
                <button
                  key={l.id}
                  className={l.id === levelId ? "chip active" : "chip"}
                  onClick={() => {
                    setActiveLevelId(l.id);
                    setSelectedId(undefined);
                    setCalibration({});
                  }}
                >
                  {l.name}
                </button>
              ))}
              <button className="chip" onClick={onAddLevel} title="Додати поверх">+</button>
            </div>
            {level && (
              <p className="muted">
                Відмітка {level.elevationMm} мм, стеля {level.ceilingHeightMm} мм
              </p>
            )}
          </section>

          <section>
            <h3>Креслення</h3>
            <label className="button wide">
              Додати PDF / зображення
              <input
                type="file"
                accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={(e) => {
                  void onPickUnderlay(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {level?.underlay && (
              <>
                <p className="muted">
                  {level.underlay.fileName} · {level.underlay.mmPerPx.toFixed(3)} мм/піксель
                  {!loadedUnderlay && " · файл потрібно додати знову"}
                </p>
                {loadedUnderlay && (
                  <>
                    <label className="field">
                      Прозорість
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={options.underlayOpacity}
                        onChange={(e) =>
                          setOptions((o) => ({ ...o, underlayOpacity: Number(e.target.value) }))
                        }
                      />
                    </label>
                    {loadedUnderlay.pxPerPdfPoint !== undefined && (
                      <div className="row scale-row">
                        <label htmlFor="drawing-scale">Масштаб 1:</label>
                        <input
                          id="drawing-scale"
                          value={drawingScale}
                          inputMode="numeric"
                          onChange={(e) => setDrawingScale(e.target.value)}
                        />
                        <button onClick={applyDrawingScale}>Застосувати</button>
                      </div>
                    )}
                    <button className="wide" onClick={() => chooseTool("calibrate")}>
                      Калібрувати масштаб
                    </button>
                  </>
                )}
                <button className="wide" onClick={removeUnderlay}>Прибрати креслення</button>
              </>
            )}
            {tool === "calibrate" && loadedUnderlay && (
              <div className="callout">
                <p>
                  {!calibration.a
                    ? "Клікніть першу точку відомого розміру."
                    : !calibration.b
                      ? "Клікніть другу точку."
                      : `Позначено ${measuredMm} мм (у поточному масштабі). Введіть фактичну довжину:`}
                </p>
                {calibrationReady && (
                  <div className="row">
                    <input
                      value={realLength}
                      inputMode="decimal"
                      placeholder="напр. 4,5"
                      onChange={(e) => setRealLength(e.target.value)}
                      aria-label="Фактична довжина"
                    />
                    <select
                      value={lengthUnit}
                      onChange={(e) => setLengthUnit(e.target.value as "mm" | "m")}
                      aria-label="Одиниці"
                    >
                      <option value="m">м</option>
                      <option value="mm">мм</option>
                    </select>
                    <button onClick={applyCalibration}>Застосувати</button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section>
            <h3>Параметри інструмента</h3>
            {tool === "wall" && (
              <>
                <label className="field">
                  Товщина, мм
                  <input
                    type="number"
                    min={20}
                    step={10}
                    value={toolParams.wallThicknessMm}
                    onChange={(e) =>
                      setToolParams((p) => ({ ...p, wallThicknessMm: Math.max(20, Math.round(toNumber(e.target.value, 200))) }))
                    }
                  />
                </label>
                <label className="field">
                  Матеріал
                  <select
                    value={toolParams.wallMaterial}
                    onChange={(e) => setToolParams((p) => ({ ...p, wallMaterial: e.target.value as WallMaterial }))}
                  >
                    {(Object.keys(WALL_MATERIAL_LABELS) as WallMaterial[]).map((m) => (
                      <option key={m} value={m}>{WALL_MATERIAL_LABELS[m]}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {(tool === "door" || tool === "window") && (
              <>
                {(["widthMm", "heightMm", "sillMm"] as const).map((key) => (
                  <label className="field" key={key}>
                    {key === "widthMm" ? "Ширина, мм" : key === "heightMm" ? "Висота, мм" : "Підвіконня, мм"}
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={toolParams[tool][key]}
                      onChange={(e) =>
                        setToolParams((p) => ({
                          ...p,
                          [tool]: { ...p[tool], [key]: Math.max(key === "sillMm" ? 0 : 100, Math.round(toNumber(e.target.value, 0))) },
                        }))
                      }
                    />
                  </label>
                ))}
              </>
            )}
            {tool !== "wall" && tool !== "door" && tool !== "window" && (
              <p className="muted">Для цього інструмента параметрів немає.</p>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={options.grid}
                onChange={(e) => setOptions((o) => ({ ...o, grid: e.target.checked }))}
              />
              Прив'язка до сітки
            </label>
            <label className="field">
              Крок сітки
              <select
                value={options.gridMm}
                onChange={(e) => setOptions((o) => ({ ...o, gridMm: Number(e.target.value) }))}
              >
                {[50, 100, 250, 500].map((v) => (
                  <option key={v} value={v}>{v} мм</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={options.ortho}
                onChange={(e) => setOptions((o) => ({ ...o, ortho: e.target.checked }))}
              />
              Ортогональні стіни
            </label>
          </section>

          <section>
            <h3>Вибране</h3>
            {!selectedId && <p className="muted">Нічого не вибрано.</p>}
            {selectedWall && (
              <p>
                Стіна · {WALL_MATERIAL_LABELS[selectedWall.material]}, {selectedWall.thicknessMm} мм ·
                довжина {Math.round(distanceMm(selectedWall.start, selectedWall.end))} мм
              </p>
            )}
            {selectedOpening && (
              <p>
                {selectedOpening.kind === "door" ? "Двері" : "Вікно"} · {selectedOpening.widthMm}×
                {selectedOpening.heightMm} мм, підвіконня {selectedOpening.sillMm} мм
              </p>
            )}
            {selectedLine && (
              <p>
                Лінія {selectedLine.id} · обхід {selectedLine.segments.detourMm} мм. Перетягуйте білі
                квадрати посередині ланок, щоб змінити трасу.
              </p>
            )}
            {selectedPoint && (
              <p>
                {POINT_KIND_LABELS[selectedPoint.kind]} · ({selectedPoint.xMm}; {selectedPoint.yMm}) мм ·
                висота {selectedPoint.heightMm} мм
              </p>
            )}
            {selectedPoint && selectedPoint.kind !== "board" && (
              <label className="field">
                Коло
                <select
                  value={selectedPointGroupId}
                  onChange={(e) => apply((p) => setPointGroup(p, selectedPoint.id, e.target.value || undefined))}
                >
                  <option value="">— без кола —</option>
                  {project.groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>
            )}
            {selectedId && (
              <button
                className="wide danger"
                onClick={() => {
                  apply((p) => removeById(p, selectedId));
                  setSelectedId(undefined);
                }}
              >
                Видалити
              </button>
            )}
          </section>

          <section>
            <h3>Кола</h3>
            <p className="muted">Нові точки потрапляють в активне коло.</p>
            {project.groups.map((g, i) => (
              <div key={g.id} className={g.id === activeGroupId ? "group-row active" : "group-row"}>
                <button
                  className="swatch"
                  style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}
                  title="Зробити активним"
                  aria-label={`Активне коло: ${g.name}`}
                  onClick={() => setActiveGroupId(g.id === activeGroupId ? undefined : g.id)}
                />
                <input
                  value={g.name}
                  aria-label="Назва кола"
                  onChange={(e) => {
                    const name = e.target.value;
                    apply((p) => ({ ...p, groups: p.groups.map((x) => (x.id === g.id ? { ...x, name } : x)) }));
                  }}
                />
                <select
                  value={g.cableTypeId ?? ""}
                  aria-label="Кабель кола"
                  onChange={(e) => apply((p) => setGroupCable(p, g.id, e.target.value || undefined))}
                >
                  <option value="">кабель за замовч.</option>
                  {region.cableTypes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  title="Видалити коло"
                  onClick={() => {
                    apply((p) => removeGroup(p, g.id));
                    if (activeGroupId === g.id) setActiveGroupId(undefined);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button className="wide" onClick={onAddGroup}>Додати коло</button>
            <button className="wide primary" onClick={onBuildRoutes}>Побудувати траси поверху</button>
            {warnings.length > 0 && (
              <ul className="warnings">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3>Замовлення кабелю</h3>
            {!calc && <p className="muted">Побудуйте траси, щоб побачити кількість кабелю.</p>}
            {calc && (
              <>
                <label className="field">
                  Бухти
                  <select value={reelMode} onChange={(e) => setReelMode(e.target.value as ReelMode)}>
                    <option value="global">спільно на весь проєкт</option>
                    <option value="perGroup">окремо для кожного кола</option>
                  </select>
                </label>
                <table className="orders">
                  <thead>
                    <tr><th>Кабель</th><th>Потрібно, м</th><th>Бухти</th><th>Залишок, м</th></tr>
                  </thead>
                  <tbody>
                    {calc.orders.map((o) => (
                      <tr key={o.cableTypeId}>
                        <td>{o.cableName}</td>
                        <td>{(o.requiredMm / 1000).toFixed(1)}</td>
                        <td>{o.reels.map((r) => `${r.count}×${r.lengthM} м`).join(", ")}</td>
                        <td>{(o.leftoverMm / 1000).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <button className="wide" onClick={onExportBom}>Експорт специфікації (CSV)</button>
          </section>

          <section>
            <h3>Підсумок поверху</h3>
            <p className="muted">
              Стін: {levelWalls.length} · Отворів: {levelOpenings.length} · Точок: {levelPoints.length}
            </p>
          </section>
        </aside>
      </div>

      <footer className="statusbar">
        <span>{status}</span>
        <span className="coords">
          {cursorInfo
            ? `X ${Math.round(cursorInfo.p.xMm)} мм · Y ${Math.round(cursorInfo.p.yMm)} мм · ${(cursorInfo.scale * 1000).toFixed(0)} px/м`
            : ""}
        </span>
      </footer>
    </div>
  );
}
