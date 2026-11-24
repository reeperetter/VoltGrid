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
});
