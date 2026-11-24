import { describe, expect, it } from "vitest";
import { getRegionProfile } from "@voltgrid/regions";
import {
  addLevel,
  addOpeningAt,
  addPoint,
  addWall,
  movePoint,
  nextId,
  removeById,
  setLevelUnderlay,
} from "./edit";
import { canRedo, canUndo, commit, createHistory, redo, undo } from "./history";
import { ProjectSchema, createEmptyProject, parseProject, serializeProject } from "./project";
import { createSamplePlan } from "./sample";

const pl = getRegionProfile("pl");

function base() {
  const p0 = createEmptyProject({ id: "p", name: "Тест", regionId: "pl" });
  const lvl = addLevel(p0, { name: "1", ceilingHeightMm: 2700 });
  const wall = addWall(lvl.project, {
    levelId: lvl.id,
    start: { xMm: 0, yMm: 0 },
    end: { xMm: 5000, yMm: 0 },
    thicknessMm: 200,
    material: "brick",
  });
  return { project: wall.project, levelId: lvl.id, wallId: wall.id };
}

describe("редагування моделі", () => {
  it("nextId бере наступний номер за максимальним", () => {
    expect(nextId("w", [{ id: "w1" }, { id: "w7" }, { id: "x9" }])).toBe("w8");
    expect(nextId("w", [])).toBe("w1");
  });

  it("відмітка нового поверху = попередня + стеля + перекриття 300 мм", () => {
    const { project } = base();
    const second = addLevel(project, { name: "2", ceilingHeightMm: 2700 });
    expect(second.project.levels[1]!.elevationMm).toBe(0 + 2700 + 300);
  });

  it("стіна нульової довжини відхиляється", () => {
    const { project, levelId } = base();
    expect(() =>
      addWall(project, {
        levelId,
        start: { xMm: 10, yMm: 10 },
        end: { xMm: 10, yMm: 10 },
        thicknessMm: 100,
        material: "drywall",
      }),
    ).toThrow();
  });

  it("отвір центрується на клікові: клік на 2500 мм, ширина 900 → зсув 2050", () => {
    const { project, levelId } = base();
    const r = addOpeningAt(project, {
      levelId, kind: "door", at: { xMm: 2500, yMm: 80 }, maxDistanceMm: 200,
      widthMm: 900, heightMm: 2100, sillMm: 0,
    });
    expect(r!.project.openings[0]!.offsetMm).toBe(2050);
  });

  it("отвір біля краю зсувається, щоб вміститись у стіну", () => {
    const { project, levelId } = base();
    const r = addOpeningAt(project, {
      levelId, kind: "window", at: { xMm: 100, yMm: 0 }, maxDistanceMm: 200,
      widthMm: 1500, heightMm: 1400, sillMm: 900,
    });
    expect(r!.project.openings[0]!.offsetMm).toBe(0);
    const right = addOpeningAt(project, {
      levelId, kind: "window", at: { xMm: 4990, yMm: 0 }, maxDistanceMm: 200,
      widthMm: 1500, heightMm: 1400, sillMm: 900,
    });
    expect(right!.project.openings[0]!.offsetMm).toBe(3500);
  });

  it("немає стіни поруч або отвір ширший за стіну → undefined", () => {
    const { project, levelId } = base();
    const far = addOpeningAt(project, {
      levelId, kind: "door", at: { xMm: 2500, yMm: 3000 }, maxDistanceMm: 200,
      widthMm: 900, heightMm: 2100, sillMm: 0,
    });
    expect(far).toBeUndefined();
    const wide = addOpeningAt(project, {
      levelId, kind: "door", at: { xMm: 2500, yMm: 0 }, maxDistanceMm: 200,
      widthMm: 6000, heightMm: 2100, sillMm: 0,
    });
    expect(wide).toBeUndefined();
  });

  it("видалення стіни прибирає і її отвори", () => {
    const { project, levelId, wallId } = base();
    const withOpening = addOpeningAt(project, {
      levelId, kind: "door", at: { xMm: 2500, yMm: 0 }, maxDistanceMm: 200,
      widthMm: 900, heightMm: 2100, sillMm: 0,
    })!.project;
    const after = removeById(withOpening, wallId);
    expect(after.walls).toHaveLength(0);
    expect(after.openings).toHaveLength(0);
  });

  it("точку можна додати, перемістити й видалити", () => {
    const { project, levelId } = base();
    const added = addPoint(project, { levelId, kind: "socket", at: { xMm: 1000, yMm: 1000 }, heightMm: 300 });
    const moved = movePoint(added.project, added.id, { xMm: 1500.4, yMm: 900 });
    expect(moved.points[0]).toMatchObject({ xMm: 1500, yMm: 900 });
    expect(removeById(moved, added.id).points).toHaveLength(0);
  });

  it("підкладку можна задати й прибрати", () => {
    const { project, levelId } = base();
    const withU = setLevelUnderlay(project, levelId, { fileName: "plan.pdf", mmPerPx: 12.5 });
    expect(withU.levels[0]!.underlay).toEqual({ fileName: "plan.pdf", mmPerPx: 12.5 });
    expect(setLevelUnderlay(withU, levelId, undefined).levels[0]!.underlay).toBeUndefined();
  });
});

describe("тестовий план", () => {
  it("валідний і містить очікувані елементи", () => {
    const plan = createSamplePlan(pl);
    expect(ProjectSchema.safeParse(plan).success).toBe(true);
    expect(plan.walls).toHaveLength(6);
    expect(plan.openings).toHaveLength(4);
    expect(plan.points).toHaveLength(12);
    expect(plan.groups).toHaveLength(2);
  });

  it("висоти розеток і вимикачів беруться з профілю регіону", () => {
    const plan = createSamplePlan(pl);
    const socket = plan.points.find((p) => p.kind === "socket")!;
    const sw = plan.points.find((p) => p.kind === "switch")!;
    expect(socket.heightMm).toBe(pl.mountingHeightsMm.socket);
    expect(sw.heightMm).toBe(pl.mountingHeightsMm.switch);
  });

  it("серіалізація й розбір дають той самий проєкт", () => {
    const plan = createSamplePlan(pl);
    expect(parseProject(serializeProject(plan))).toEqual(plan);
  });
});

describe("схема проєкту (нові сутності)", () => {
  it("відхиляє отвір, що виходить за стіну", () => {
    const { project, wallId } = base();
    const bad = {
      ...project,
      openings: [{ id: "o1", wallId, kind: "door" as const, offsetMm: 4500, widthMm: 900, heightMm: 2100, sillMm: 0 }],
    };
    expect(ProjectSchema.safeParse(bad).success).toBe(false);
  });

  it("відхиляє точку з неіснуючим поверхом і стіну нульової довжини", () => {
    const { project } = base();
    const badPoint = {
      ...project,
      points: [{ id: "pt1", levelId: "ghost", kind: "socket" as const, xMm: 0, yMm: 0, heightMm: 300 }],
    };
    expect(ProjectSchema.safeParse(badPoint).success).toBe(false);
    const badWall = {
      ...project,
      walls: [{ ...project.walls[0]!, end: project.walls[0]!.start }],
    };
    expect(ProjectSchema.safeParse(badWall).success).toBe(false);
  });
});

describe("історія змін", () => {
  it("undo/redo працюють, нова зміна скидає redo-гілку", () => {
    let h = createHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = commit(h, 9);
    expect(canRedo(h)).toBe(false);
  });

  it("однакова версія не створює запис історії", () => {
    const h = createHistory({ a: 1 });
    expect(commit(h, h.present)).toBe(h);
  });
});
