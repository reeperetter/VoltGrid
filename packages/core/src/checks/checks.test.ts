import { describe, expect, it } from "vitest";
import { getRegionProfile, type RegionProfile } from "@voltgrid/regions";
import { balancePhases } from "./phaseBalance";
import { checkOverload } from "./overload";
import { checkVoltageDrop } from "./voltageDrop";

const pl = getRegionProfile("pl");

function withLimits(limits: { lighting?: number; other?: number }): RegionProfile {
  return { ...pl, voltageDrop: { ...pl.voltageDrop, limitsPercent: limits } };
}

describe("падіння напруги", () => {
  // R = 0,0206 · 20 / 2,5 = 0,1648 Ом (в один бік)
  it("еталон 1ф: 16 А, 20 м, 2,5 мм² → ΔU = 2·16·0,1648 = 5,2736 В (2,293 %)", () => {
    const r = checkVoltageDrop(
      { currentA: 16, lengthMm: 20_000, crossSectionMm2: 2.5, phases: 1, loadKind: "other" },
      pl,
    );
    expect(r.dropV).toBeCloseTo(5.2736, 4);
    expect(r.dropPercent).toBeCloseTo(2.2929, 3);
    expect(r.referenceVoltageV).toBe(230);
  });

  it("еталон 3ф: √3·16·0,1648 ≈ 4,5671 В (1,142 % від 400 В)", () => {
    const r = checkVoltageDrop(
      { currentA: 16, lengthMm: 20_000, crossSectionMm2: 2.5, phases: 3, loadKind: "other" },
      pl,
    );
    expect(r.dropV).toBeCloseTo(4.5671, 3);
    expect(r.dropPercent).toBeCloseTo(1.1418, 3);
  });

  it("cosφ зменшує активну складову падіння", () => {
    const r = checkVoltageDrop(
      { currentA: 16, lengthMm: 20_000, crossSectionMm2: 2.5, phases: 1, powerFactor: 0.5, loadKind: "other" },
      pl,
    );
    expect(r.dropV).toBeCloseTo(2.6368, 4);
  });

  it("без заданої межі статус «noLimit», а не вигадане значення", () => {
    const r = checkVoltageDrop(
      { currentA: 16, lengthMm: 20_000, crossSectionMm2: 2.5, phases: 1, loadKind: "lighting" },
      pl,
    );
    expect(r.limitPercent).toBeUndefined();
    expect(r.status).toBe("noLimit");
  });

  it("з межею: 2,29 % проходить при 3 % і не проходить при 2 %", () => {
    const input = { currentA: 16, lengthMm: 20_000, crossSectionMm2: 2.5, phases: 1 as const, loadKind: "other" as const };
    expect(checkVoltageDrop(input, withLimits({ other: 3 })).status).toBe("ok");
    expect(checkVoltageDrop(input, withLimits({ other: 2 })).status).toBe("exceeded");
  });

  it("відхиляє некоректні вхідні дані", () => {
    const base = { currentA: 16, lengthMm: 1000, crossSectionMm2: 2.5, phases: 1 as const, loadKind: "other" as const };
    expect(() => checkVoltageDrop({ ...base, crossSectionMm2: 0 }, pl)).toThrow();
    expect(() => checkVoltageDrop({ ...base, currentA: -1 }, pl)).toThrow();
    expect(() => checkVoltageDrop({ ...base, powerFactor: 1.5 }, pl)).toThrow();
  });
});

describe("захист від перевантаження", () => {
  it("Ib 16, In 16, Iz 20 → обидві умови виконані", () => {
    const r = checkOverload({ designCurrentA: 16, ratedCurrentA: 16, cableCapacityA: 20 });
    expect(r.condition1).toBe(true);
    expect(r.condition2).toBe(true);
    expect(r.tripCurrentA).toBeCloseTo(23.2, 6);
    expect(r.limitCurrentA).toBeCloseTo(29, 6);
  });

  it("In 20 > Iz 18 → умова 1 не виконана", () => {
    const r = checkOverload({ designCurrentA: 16, ratedCurrentA: 20, cableCapacityA: 18 });
    expect(r.condition1).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("Ib 17 > In 16 → умова 1 не виконана", () => {
    const r = checkOverload({ designCurrentA: 17, ratedCurrentA: 16, cableCapacityA: 20 });
    expect(r.condition1).toBe(false);
  });

  it("запобіжник k2 = 1,6 при In = Iz: умова 1 так, умова 2 ні", () => {
    const r = checkOverload({ designCurrentA: 10, ratedCurrentA: 16, cableCapacityA: 16, k2: 1.6 });
    expect(r.condition1).toBe(true);
    expect(r.condition2).toBe(false);
  });

  it("автомат при In = Iz: умова 2 виконується на межі", () => {
    const r = checkOverload({ designCurrentA: 10, ratedCurrentA: 16, cableCapacityA: 16 });
    expect(r.ok).toBe(true);
  });
});

describe("баланс фаз", () => {
  it("розподіляє 4000/3000/2000/2000/1000 Вт порівну по 4000 Вт", () => {
    const r = balancePhases([
      { id: "a", powerW: 4000 },
      { id: "b", powerW: 3000 },
      { id: "c", powerW: 2000 },
      { id: "d", powerW: 2000 },
      { id: "e", powerW: 1000 },
    ]);
    expect(r.assignment).toEqual({ a: 0, b: 1, c: 2, d: 2, e: 1 });
    expect(r.totalsW).toEqual([4000, 4000, 4000]);
    expect(r.maxDeviationPercent).toBe(0);
  });

  it("поважає ручне закріплення за фазою", () => {
    const r = balancePhases([
      { id: "a", powerW: 3000, fixedPhase: 2 },
      { id: "b", powerW: 1000 },
    ]);
    expect(r.assignment.a).toBe(2);
    expect(r.assignment.b).toBe(0);
  });

  it("результат не залежить від порядку вхідних даних", () => {
    const loads = [
      { id: "x", powerW: 2500 },
      { id: "y", powerW: 2500 },
      { id: "z", powerW: 1200 },
    ];
    expect(balancePhases(loads).assignment).toEqual(balancePhases([...loads].reverse()).assignment);
  });

  it("порожній набір не дає ділення на нуль", () => {
    expect(balancePhases([]).maxDeviationPercent).toBe(0);
  });

  it("відхиляє повторні ідентифікатори", () => {
    expect(() => balancePhases([{ id: "a", powerW: 1 }, { id: "a", powerW: 2, fixedPhase: 0 }])).toThrow();
  });
});
