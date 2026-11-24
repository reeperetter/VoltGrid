import { describe, expect, it } from "vitest";
import {
  distanceMm,
  mmPerPxFromDrawingScale,
  nearestTarget,
  projectOnSegment,
  rescaleMmPerPx,
  roundMm,
  snapOrthogonal,
  snapToGrid,
} from "./geometry";

describe("геометрія", () => {
  it("відстань 3-4-5", () => {
    expect(distanceMm({ xMm: 0, yMm: 0 }, { xMm: 3000, yMm: 4000 })).toBe(5000);
  });

  it("округлення не дає від'ємного нуля", () => {
    expect(Object.is(roundMm(-0.4), 0)).toBe(true);
  });

  it("прив'язка до сітки 100 мм", () => {
    expect(snapToGrid({ xMm: 149, yMm: 151 }, 100)).toEqual({ xMm: 100, yMm: 200 });
    expect(snapToGrid({ xMm: -30, yMm: 0 }, 100)).toEqual({ xMm: 0, yMm: 0 });
  });

  it("ортогональна прив'язка вибирає домінуючу вісь", () => {
    const from = { xMm: 1000, yMm: 1000 };
    expect(snapOrthogonal(from, { xMm: 5000, yMm: 1400 })).toEqual({ xMm: 5000, yMm: 1000 });
    expect(snapOrthogonal(from, { xMm: 1300, yMm: 4000 })).toEqual({ xMm: 1000, yMm: 4000 });
  });

  it("проєкція на відрізок і відстань до нього", () => {
    const r = projectOnSegment({ xMm: 3000, yMm: 500 }, { xMm: 0, yMm: 0 }, { xMm: 10000, yMm: 0 });
    expect(r.offsetMm).toBe(3000);
    expect(r.distanceMm).toBe(500);
  });

  it("проєкція обмежується кінцями відрізка", () => {
    const r = projectOnSegment({ xMm: -2000, yMm: 0 }, { xMm: 0, yMm: 0 }, { xMm: 10000, yMm: 0 });
    expect(r.t).toBe(0);
    expect(r.distanceMm).toBe(2000);
  });

  it("найближча ціль у радіусі, інакше undefined", () => {
    const targets = [{ xMm: 0, yMm: 0 }, { xMm: 100, yMm: 0 }];
    expect(nearestTarget({ xMm: 90, yMm: 0 }, targets, 50)).toEqual({ xMm: 100, yMm: 0 });
    expect(nearestTarget({ xMm: 500, yMm: 0 }, targets, 50)).toBeUndefined();
  });

  it("калібрування: відрізок 2000 мм у поточному масштабі має бути 5000 мм → масштаб × 2,5", () => {
    expect(rescaleMmPerPx(10, 2000, 5000)).toBe(25);
  });

  it("масштаб креслення 1:100 при 1 px/pt → 35,278 мм/px; при 2,5 px/pt → 14,111 мм/px", () => {
    expect(mmPerPxFromDrawingScale(100, 1)).toBeCloseTo(35.2778, 3);
    expect(mmPerPxFromDrawingScale(100, 2.5)).toBeCloseTo(14.1111, 3);
    expect(() => mmPerPxFromDrawingScale(0, 1)).toThrow();
  });

  it("калібрування відхиляє нульові й від'ємні значення", () => {
    expect(() => rescaleMmPerPx(10, 0, 5000)).toThrow();
    expect(() => rescaleMmPerPx(10, 2000, -1)).toThrow();
    expect(() => rescaleMmPerPx(0, 2000, 5000)).toThrow();
  });
});
