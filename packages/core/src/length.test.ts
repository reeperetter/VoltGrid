import { describe, expect, it } from "vitest";
import { calcLineLength } from "./length";

describe("довжина лінії", () => {
  it("еталон: (5000 + 2400 + 300) × 1,10 = 8470 мм", () => {
    const r = calcLineLength({ horizontalMm: 5000, verticalMm: 2400, detourMm: 300 }, 10);
    expect(r.baseMm).toBe(7700);
    expect(r.reserveMm).toBe(770);
    expect(r.totalMm).toBe(8470);
  });

  it("не втрачає точність на круглих числах (1000 мм × 10 % = 100 мм, а не 101)", () => {
    const r = calcLineLength({ horizontalMm: 1000, verticalMm: 0, detourMm: 0 }, 10);
    expect(r.reserveMm).toBe(100);
  });

  it("запас округлюється вгору до цілого мм", () => {
    // 1001 × 10 % = 100,1 → 101
    const r = calcLineLength({ horizontalMm: 1001, verticalMm: 0, detourMm: 0 }, 10);
    expect(r.reserveMm).toBe(101);
    expect(r.totalMm).toBe(1102);
  });

  it("нульовий запас дає чисту трасу", () => {
    const r = calcLineLength({ horizontalMm: 3000, verticalMm: 1500, detourMm: 0 }, 0);
    expect(r.totalMm).toBe(4500);
  });

  it("відхиляє від'ємний запас і дробові мм", () => {
    expect(() => calcLineLength({ horizontalMm: 1000, verticalMm: 0, detourMm: 0 }, -1)).toThrow();
    expect(() => calcLineLength({ horizontalMm: 1000.5, verticalMm: 0, detourMm: 0 }, 10)).toThrow();
  });
});
