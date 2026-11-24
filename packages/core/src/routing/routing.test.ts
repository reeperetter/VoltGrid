import { describe, expect, it } from "vitest";
import { getRegionProfile } from "@voltgrid/regions";
import { addGroup, addLevel, addPoint, addWall, replaceLevelLines, removeGroup, setPointGroup } from "../edit";
import { calcProjectCables } from "../order";
import { ProjectSchema, createEmptyProject, type Opening, type Wall } from "../project";
import { createSamplePlan } from "../sample";
import { orderChain } from "./chain";
import { DEFAULT_ROUTING_OPTIONS, RoutingGrid, type Bounds } from "./grid";
import { planLevelRoutes } from "./plan";

const pl = getRegionProfile("pl");

const BOUNDS: Bounds = { minXMm: -2000, minYMm: -2000, maxXMm: 12000, maxYMm: 6000 };

/** Вертикальна стіна x = 5000 на всю висоту області. */
function dividingWall(): Wall {
  return {
    id: "w1",
    levelId: "lvl1",
    start: { xMm: 5000, yMm: -10_000 },
    end: { xMm: 5000, yMm: 10_000 },
    thicknessMm: 120,
    material: "drywall",
  };
}

function opening(kind: "door" | "window"): Opening {
  // Отвір y ∈ [1500; 2400] (зсув від початку стіни y = -10 000).
  return { id: "o1", wallId: "w1", kind, offsetMm: 11_500, widthMm: 900, heightMm: 2100, sillMm: 0 };
}

function axisAligned(path: readonly { xMm: number; yMm: number }[]): boolean {
  return path.every((p, i) => i === 0 || p.xMm === path[i - 1]!.xMm || p.yMm === path[i - 1]!.yMm);
}

describe("сітка трасування", () => {
  it("відкрита кімната: довжина дорівнює відстані за Манхеттеном, один поворот", () => {
    const grid = new RoutingGrid(BOUNDS, [], []);
    const r = grid.route({ xMm: 1000, yMm: 1000 }, { xMm: 5000, yMm: 3000 })!;
    expect(r.lengthMm).toBe(6000);
    expect(r.path).toHaveLength(3);
    expect(axisAligned(r.path)).toBe(true);
  });

  it("стіна без дверей — шляху немає", () => {
    const grid = new RoutingGrid(BOUNDS, [dividingWall()], []);
    expect(grid.route({ xMm: 1000, yMm: 1000 }, { xMm: 9000, yMm: 1000 })).toBeUndefined();
  });

  it("вікно не є проходом", () => {
    const grid = new RoutingGrid(BOUNDS, [dividingWall()], [opening("window")]);
    expect(grid.route({ xMm: 1000, yMm: 1000 }, { xMm: 9000, yMm: 1000 })).toBeUndefined();
  });

  it("двері: маршрут проходить через отвір з відступом 20 см від одвірка (y = 1700), обхід 1400 мм", () => {
    const grid = new RoutingGrid(BOUNDS, [dividingWall()], [opening("door")]);
    const r = grid.route({ xMm: 1000, yMm: 1000 }, { xMm: 9000, yMm: 1000 })!;
    expect(r.lengthMm).toBe(8000 + 2 * 700);
    expect(r.path).toEqual([
      { xMm: 1000, yMm: 1000 },
      { xMm: 1000, yMm: 1700 },
      { xMm: 9000, yMm: 1700 },
      { xMm: 9000, yMm: 1000 },
    ]);
  });

  it("точка на самій стіні: маршрут будується від найближчої вільної клітинки", () => {
    const grid = new RoutingGrid(BOUNDS, [dividingWall()], [opening("door")]);
    const r = grid.route({ xMm: 5000, yMm: 1000 }, { xMm: 9000, yMm: 1000 });
    expect(r).toBeDefined();
    expect(r!.path[0]).toEqual({ xMm: 5000, yMm: 1000 });
  });

  it("зайве велика область відхиляється зрозумілою помилкою", () => {
    const huge: Bounds = { minXMm: 0, minYMm: 0, maxXMm: 1_000_000, maxYMm: 1_000_000 };
    expect(() => new RoutingGrid(huge, [], [], DEFAULT_ROUTING_OPTIONS)).toThrow(/завелика/);
  });
});

describe("порядок підключення кола", () => {
  it("щит → найближча → наступна найближча", () => {
    const ordered = orderChain({ xMm: 0, yMm: 0 }, [
      { id: "p2", xMm: 5000, yMm: 0 },
      { id: "p1", xMm: 1000, yMm: 0 },
      { id: "p3", xMm: 2000, yMm: 0 },
    ]);
    expect(ordered.map((p) => p.id)).toEqual(["p1", "p3", "p2"]);
  });

  it("рівна відстань — менший id, результат не залежить від порядку на вході", () => {
    const pts = [
      { id: "b", xMm: 0, yMm: 1000 },
      { id: "a", xMm: 1000, yMm: 0 },
    ];
    expect(orderChain({ xMm: 0, yMm: 0 }, pts).map((p) => p.id)).toEqual(["a", "b"]);
    expect(orderChain({ xMm: 0, yMm: 0 }, [...pts].reverse()).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("план трас поверху", () => {
  it("тестовий план: 11 ліній, без попереджень, шляхи ортогональні", () => {
    const sample = createSamplePlan(pl);
    const levelId = sample.levels[0]!.id;
    const plan = planLevelRoutes(sample, pl, levelId);
    expect(plan.warnings).toEqual([]);
    expect(plan.lines).toHaveLength(11);
    for (const line of plan.lines) {
      expect(axisAligned(line.path!)).toBe(true);
      expect(Number.isInteger(line.segments.horizontalMm + line.segments.verticalMm + line.segments.detourMm)).toBe(true);
    }
  });

  it("перша ланка розеток: щит (7750; 5600) → розетка (7750; 4500)", () => {
    // Обидві точки в зоні відступу 20 см від зовнішньої стіни → траса зміщується до вільної клітинки (x = 7600):
    // 150 + 1100 + 150 = 1400 мм маршруту, з них 1100 — пряма відстань, 300 — обхід.
    // Вертикаль: (2400 + 150) + (300 + 150) = 3000 мм.
    const sample = createSamplePlan(pl);
    const plan = planLevelRoutes(sample, pl, sample.levels[0]!.id);
    const first = plan.lines[0]!;
    expect(first.segments).toEqual({ horizontalMm: 1100, verticalMm: 3000, detourMm: 300 });
    expect(first.cableTypeId).toBe("ydyp-3x2.5");
  });

  it("коло освітлення за замовчуванням іде кабелем 3×1,5", () => {
    const sample = createSamplePlan(pl);
    const plan = planLevelRoutes(sample, pl, sample.levels[0]!.id);
    const lighting = sample.groups.find((g) => g.name === "Освітлення")!;
    const lines = plan.lines.filter((l) => l.groupId === lighting.id);
    expect(lines).toHaveLength(5);
    expect(lines.every((l) => l.cableTypeId === "ydyp-3x1.5")).toBe(true);
  });

  it("траси можна записати в проєкт і порахувати замовлення кабелю", () => {
    const sample = createSamplePlan(pl);
    const levelId = sample.levels[0]!.id;
    const plan = planLevelRoutes(sample, pl, levelId);
    const withLines = replaceLevelLines(sample, levelId, plan.lines);
    expect(ProjectSchema.safeParse(withLines).success).toBe(true);
    expect(withLines.lines.map((l) => l.id).slice(0, 3)).toEqual(["ln1", "ln2", "ln3"]);

    const calc = calcProjectCables(withLines, pl, { reelMode: "global" });
    expect(calc.orders.map((o) => o.cableTypeId).sort()).toEqual(["ydyp-3x1.5", "ydyp-3x2.5"]);
    for (const order of calc.orders) {
      expect(order.requiredMm).toBeGreaterThan(0);
      expect(order.purchasedMm).toBeGreaterThanOrEqual(order.requiredMm);
    }

    // Повторна заміна не дублює лінії.
    const again = replaceLevelLines(withLines, levelId, plan.lines);
    expect(again.lines).toHaveLength(withLines.lines.length);
  });

  it("без щита — одне зрозуміле попередження і жодних ліній", () => {
    const p0 = createEmptyProject({ id: "p", name: "x", regionId: "pl" });
    const lvl = addLevel(p0, { name: "1", ceilingHeightMm: 2700 });
    const plan = planLevelRoutes(lvl.project, pl, lvl.id);
    expect(plan.lines).toEqual([]);
    expect(plan.warnings[0]).toMatch(/немає щита/);
  });

  it("точки без кола не трасуються, про них попереджаємо", () => {
    const sample = createSamplePlan(pl);
    const levelId = sample.levels[0]!.id;
    const socket = sample.points.find((p) => p.kind === "socket")!;
    const detached = setPointGroup(sample, socket.id, undefined);
    const plan = planLevelRoutes(detached, pl, levelId);
    expect(plan.warnings.join(" ")).toMatch(/Точок без кола: 1/);
    expect(plan.lines).toHaveLength(10);
  });

  it("недосяжна точка (кімната без дверей) пропускається з попередженням", () => {
    let p = createEmptyProject({ id: "p", name: "x", regionId: "pl" });
    const lvl = addLevel(p, { name: "1", ceilingHeightMm: 2700 });
    p = lvl.project;
    const g = addGroup(p, { name: "Розетки" });
    p = g.project;
    // Суцільна стіна на всю область розділяє щит і розетку.
    p = addWall(p, { levelId: lvl.id, start: { xMm: 5000, yMm: -20_000 }, end: { xMm: 5000, yMm: 20_000 }, thicknessMm: 120, material: "drywall" }).project;
    p = addPoint(p, { levelId: lvl.id, kind: "board", at: { xMm: 1000, yMm: 1000 }, heightMm: 2400 }).project;
    p = addPoint(p, { levelId: lvl.id, kind: "socket", at: { xMm: 9000, yMm: 1000 }, heightMm: 300, groupId: g.id }).project;
    const plan = planLevelRoutes(p, pl, lvl.id);
    expect(plan.lines).toEqual([]);
    expect(plan.warnings.join(" ")).toMatch(/немає шляху/);
  });

  it("видалення кола прибирає його лінії й знімає призначення з точок", () => {
    const sample = createSamplePlan(pl);
    const levelId = sample.levels[0]!.id;
    const withLines = replaceLevelLines(sample, levelId, planLevelRoutes(sample, pl, levelId).lines);
    const groupId = sample.groups[0]!.id;
    const after = removeGroup(withLines, groupId);
    expect(after.groups.some((g) => g.id === groupId)).toBe(false);
    expect(after.lines.every((l) => l.groupId !== groupId)).toBe(true);
    expect(after.points.every((p) => p.groupId !== groupId)).toBe(true);
    expect(ProjectSchema.safeParse(after).success).toBe(true);
  });
});
