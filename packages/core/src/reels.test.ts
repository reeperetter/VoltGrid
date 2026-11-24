import { describe, expect, it } from "vitest";
import { planReels } from "./reels";

describe("підбір бухт", () => {
  it("8470 мм при бухті 100 м → 1 бухта, залишок 91,53 м", () => {
    const p = planReels(8470, [100]);
    expect(p.reels).toEqual([{ lengthM: 100, count: 1 }]);
    expect(p.purchasedMm).toBe(100_000);
    expect(p.leftoverMm).toBe(91_530);
  });

  it("ровно 100 м → 1 бухта без залишку", () => {
    const p = planReels(100_000, [100]);
    expect(p.reels).toEqual([{ lengthM: 100, count: 1 }]);
    expect(p.leftoverMm).toBe(0);
  });

  it("100,001 м → 2 бухти", () => {
    const p = planReels(100_001, [100]);
    expect(p.reels).toEqual([{ lengthM: 100, count: 2 }]);
  });

  it("нуль потреби → порожній план", () => {
    expect(planReels(0, [100])).toEqual({ requiredMm: 0, purchasedMm: 0, leftoverMm: 0, reels: [] });
  });

  it("кілька розмірів: 130 м із бухт 50 і 100 → 100 + 50 (150 м), а не 3×50", () => {
    const p = planReels(130_000, [50, 100]);
    expect(p.purchasedMm).toBe(150_000);
    expect(p.reels).toEqual([
      { lengthM: 100, count: 1 },
      { lengthM: 50, count: 1 },
    ]);
  });

  it("кілька розмірів: 210 м із 50 і 100 → 100 + 100 + 50 (250 м)", () => {
    const p = planReels(210_000, [50, 100]);
    expect(p.purchasedMm).toBe(250_000);
    expect(p.reels).toEqual([
      { lengthM: 100, count: 2 },
      { lengthM: 50, count: 1 },
    ]);
  });

  it("при однаковому перебрі обирає менше бухт: 100 м із 25 і 100 → 1×100", () => {
    const p = planReels(100_000, [25, 100]);
    expect(p.reels).toEqual([{ lengthM: 100, count: 1 }]);
  });

  it("відхиляє некоректні вхідні дані", () => {
    expect(() => planReels(-1, [100])).toThrow();
    expect(() => planReels(1000, [])).toThrow();
    expect(() => planReels(1000, [99.5])).toThrow();
  });
});
