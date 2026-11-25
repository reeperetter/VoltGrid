import { describe, expect, it } from "vitest";
import { getRegionProfile } from "@voltgrid/regions";
import { replaceLevelLines } from "../edit";
import { planLevelRoutes } from "../routing";
import { createSamplePlan } from "../sample";
import { buildCheckReport } from "./report";

const pl = getRegionProfile("pl");

function plan() {
  const s = createSamplePlan(pl);
  const id = s.levels[0]!.id;
  return replaceLevelLines(s, id, planLevelRoutes(s, pl, id).lines);
}

describe("звіт перевірок", () => {
  it("без вхідних даних — лише info (межа ΔU не задана, захист не задано)", () => {
    const items = buildCheckReport(plan(), pl);
    expect(items.length).toBe(5);
    expect(items.every((i) => i.severity !== "error")).toBe(true);
    expect(items.filter((i) => i.check === "overload").every((i) => i.severity === "info")).toBe(true);
  });

  it("без заданих даних Ib береться з типових норм профілю", () => {
    const p = plan();
    const items = buildCheckReport(p, pl).filter((i) => i.check === "voltageDrop" && /типовими нормами/.test(i.text));
    expect(items).toHaveLength(2);
    // розетки: 6 × 300 Вт / 230 В = 7,8 А
    expect(items[0]!.text).toContain("Ib 7,8 А");
  });

  it("є Ib, але межі ΔU в профілі немає → info про межу", () => {
    const p = plan();
    const withI = { ...p, groups: p.groups.map((g) => ({ ...g, designCurrentA: 10 })) };
    const dv = buildCheckReport(withI, pl).filter((i) => i.check === "voltageDrop");
    expect(dv.every((i) => i.severity === "info" && /межу не задано/.test(i.text))).toBe(true);
  });

  it("перевантаження: Ib=10, In=16, Iz=21 → ok; In=25 → error", () => {
    const p = plan();
    const mk = (breakerA: number) => ({
      ...p,
      groups: p.groups.map((g) => ({ ...g, designCurrentA: 10, breakerA, cableCapacityA: 21 })),
    });
    const ok = buildCheckReport(mk(16), pl).filter((i) => i.check === "overload");
    expect(ok.every((i) => i.severity === "ok")).toBe(true);
    const bad = buildCheckReport(mk(25), pl).filter((i) => i.check === "overload");
    expect(bad.every((i) => i.severity === "error")).toBe(true);
  });

  it("баланс фаз показується при двох колах із потужністю", () => {
    const p = plan();
    const withP = { ...p, groups: p.groups.map((g, i) => ({ ...g, powerW: 1000 * (i + 1) })) };
    const ph = buildCheckReport(withP, pl).filter((i) => i.check === "phaseBalance");
    expect(ph).toHaveLength(1);
  });
});
