import { describe, expect, it } from "vitest";
import { getRegionProfile } from "@voltgrid/regions";
import { calcProjectCables } from "./order";
import { ProjectSchema, createEmptyProject, type Project } from "./project";

const pl = getRegionProfile("pl");

function sampleProject(): Project {
  const p = createEmptyProject({ id: "p", name: "Еталон", regionId: "pl" });
  p.groups = [
    { id: "g1", name: "Розетки кухні" },
    { id: "g2", name: "Освітлення кухні" },
  ];
  // g1: 2 лінії по 60 000 мм чистої траси (66 000 із запасом 10 %)
  // g2: 1 лінія 30 000 мм (33 000 із запасом)
  p.lines = [
    { id: "l1", groupId: "g1", cableTypeId: "ydyp-3x2.5", segments: { horizontalMm: 58_000, verticalMm: 2_000, detourMm: 0 } },
    { id: "l2", groupId: "g1", cableTypeId: "ydyp-3x2.5", segments: { horizontalMm: 58_000, verticalMm: 2_000, detourMm: 0 } },
    { id: "l3", groupId: "g2", cableTypeId: "ydyp-3x2.5", segments: { horizontalMm: 28_000, verticalMm: 2_000, detourMm: 0 } },
  ];
  return p;
}

describe("замовлення кабелю", () => {
  it("глобально: 66 + 66 + 33 = 165 м → 2 бухти по 100 м", () => {
    const r = calcProjectCables(sampleProject(), pl, { reelMode: "global" });
    expect(r.lines.map((l) => l.length.totalMm)).toEqual([66_000, 66_000, 33_000]);
    expect(r.orders).toHaveLength(1);
    const order = r.orders[0]!;
    expect(order.requiredMm).toBe(165_000);
    expect(order.reels).toEqual([{ lengthM: 100, count: 2 }]);
    expect(order.leftoverMm).toBe(35_000);
  });

  it("по групах: g1 = 132 м → 2 бухти, g2 = 33 м → 1 бухта, разом 3 бухти", () => {
    const r = calcProjectCables(sampleProject(), pl, { reelMode: "perGroup" });
    const order = r.orders[0]!;
    expect(order.requiredMm).toBe(165_000);
    expect(order.reels).toEqual([{ lengthM: 100, count: 3 }]);
    expect(order.leftoverMm).toBe(135_000);
  });

  it("власний запас перекриває значення профілю", () => {
    const r = calcProjectCables(sampleProject(), pl, { reelMode: "global", reservePercent: 0 });
    expect(r.orders[0]!.requiredMm).toBe(150_000);
  });

  it("невідомий тип кабелю дає зрозумілу помилку", () => {
    const p = sampleProject();
    p.lines[0]!.cableTypeId = "nope";
    expect(() => calcProjectCables(p, pl, { reelMode: "global" })).toThrow(/невідомий тип кабелю/);
  });

  it("схема проєкту відхиляє лінію з неіснуючою групою", () => {
    const p = sampleProject();
    p.lines[0]!.groupId = "ghost";
    expect(ProjectSchema.safeParse(p).success).toBe(false);
  });
});
