import { describe, expect, it } from "vitest";
import { RegionProfileSchema, getRegionProfile, listRegionIds } from "./index";

describe("регіональні профілі", () => {
  it("профіль PL валідний і містить базові стандарти", () => {
    const pl = getRegionProfile("pl");
    expect(pl.standards).toContain("PN-HD 60364");
    expect(pl.currency).toBe("PLN");
  });

  it("ставка ПДВ за замовчуванням входить у список доступних", () => {
    for (const id of listRegionIds()) {
      const profile = getRegionProfile(id);
      expect(profile.vat.rates).toContain(profile.vat.defaultRate);
    }
  });

  it("невідомий профіль дає помилку", () => {
    expect(() => getRegionProfile("xx")).toThrow();
  });

  it("схема відхиляє профіль без стандартів", () => {
    const bad = { ...getRegionProfile("pl"), standards: [] };
    expect(RegionProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("ідентифікатори кабелів унікальні", () => {
    for (const id of listRegionIds()) {
      const ids = getRegionProfile(id).cableTypes.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("кабелі за замовчуванням для кіл існують у каталозі", () => {
    for (const id of listRegionIds()) {
      const profile = getRegionProfile(id);
      const known = new Set(profile.cableTypes.map((c) => c.id));
      for (const cableId of Object.values(profile.wiring.defaultCableByPointKind)) {
        expect(known.has(cableId)).toBe(true);
      }
    }
  });

  it("схема відхиляє дробову довжину бухти", () => {
    const pl = getRegionProfile("pl");
    const bad = {
      ...pl,
      cableTypes: [{ ...pl.cableTypes[0], reelLengthsM: [99.5] }],
    };
    expect(RegionProfileSchema.safeParse(bad).success).toBe(false);
  });
});
