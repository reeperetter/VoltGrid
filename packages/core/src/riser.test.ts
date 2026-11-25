import { describe, expect, it } from "vitest";
import { getRegionProfile } from "@voltgrid/regions";
import { buildBom } from "./bom";
import { addLevel, addPoint, addRiser, removeById } from "./edit";
import { calcProjectCables } from "./order";
import { ProjectSchema, createEmptyProject } from "./project";
import { riserSegments } from "./riser";

const pl = getRegionProfile("pl");

function building() {
  let p = createEmptyProject({ id: "b", name: "Будинок", regionId: "pl" });
  const l1 = addLevel(p, { name: "1", ceilingHeightMm: 2700 });
  const l2 = addLevel(l1.project, { name: "2", ceilingHeightMm: 2700 });
  p = l2.project;
  const b1 = addPoint(p, { levelId: l1.id, kind: "board", at: { xMm: 1000, yMm: 1000 }, heightMm: 2400 });
  const b2 = addPoint(b1.project, { levelId: l2.id, kind: "board", at: { xMm: 1500, yMm: 800 }, heightMm: 2400 });
  return { project: b2.project, b1: b1.id, b2: b2.id, l1: l1.id, l2: l2.id };
}

describe("стояки", () => {
  it("відмітка 2-го поверху = 2700 + 300, вертикаль = 3000, горизонталь = 500 + 200", () => {
    const { project, b1, b2 } = building();
    const { project: withRiser, id } = addRiser(project, { fromPointId: b1, toPointId: b2, cableTypeId: "yky-5x10" });
    expect(riserSegments(withRiser, withRiser.risers.find((r) => r.id === id)!)).toEqual({
      horizontalMm: 700,
      verticalMm: 3000,
      detourMm: 0,
    });
  });

  it("щити на одному поверсі або не-щити відхиляються", () => {
    const { project, b1, l1 } = building();
    const b3 = addPoint(project, { levelId: l1, kind: "board", at: { xMm: 3000, yMm: 1000 }, heightMm: 2400 });
    expect(() => addRiser(b3.project, { fromPointId: b1, toPointId: b3.id, cableTypeId: "yky-5x10" })).toThrow(/різних поверхах/);
    const s = addPoint(project, { levelId: l1, kind: "socket", at: { xMm: 0, yMm: 0 }, heightMm: 300 });
    expect(() => addRiser(s.project, { fromPointId: b1, toPointId: s.id, cableTypeId: "yky-5x10" })).toThrow(/лише щити/);
  });

  it("стояк потрапляє в замовлення кабелю й специфікацію; видалення щита прибирає стояк", () => {
    const { project, b1, b2 } = building();
    const cable = pl.cableTypes.find((c) => c.coreCount === 5 && c.crossSectionMm2 === 10)!;
    const { project: p } = addRiser(project, { fromPointId: b1, toPointId: b2, cableTypeId: cable.id });
    const calc = calcProjectCables(p, pl, { reelMode: "global" });
    expect(calc.orders).toHaveLength(1);
    // (700 + 3000) × 1,1 = 4070 мм
    expect(calc.orders[0]!.requiredMm).toBe(4070);
    const rows = buildBom(p, pl, "global");
    expect(rows.find((r) => r.section === "Кола" && r.name === "Стояки")?.quantity).toBe(4.07);
    const after = removeById(p, b2);
    expect(after.risers).toHaveLength(0);
    expect(ProjectSchema.safeParse(after).success).toBe(true);
  });

  it("старі проєкти без поля risers відкриваються", () => {
    const { project } = building();
    const { risers: _r, ...legacy } = project;
    expect(ProjectSchema.parse(legacy).risers).toEqual([]);
  });
});
