import { describe, expect, it } from "vitest";
import { getRegionProfile } from "@voltgrid/regions";
import { bomToCsv, buildBom } from "./bom";
import { replaceLevelLines } from "./edit";
import { planLevelRoutes } from "./routing";
import { createSamplePlan } from "./sample";

const pl = getRegionProfile("pl");

function withLines() {
  const s = createSamplePlan(pl);
  const id = s.levels[0]!.id;
  return replaceLevelLines(s, id, planLevelRoutes(s, pl, id).lines);
}

describe("специфікація", () => {
  it("без ліній: лише точки", () => {
    const rows = buildBom(createSamplePlan(pl), pl, "global");
    expect(rows.some((r) => r.section === "Кабель")).toBe(false);
    expect(rows.find((r) => r.name === "Розетка")?.quantity).toBe(6);
    expect(rows.find((r) => r.name === "Електрощит")?.quantity).toBe(1);
  });

  it("з лініями: кабель, бухти й кола узгоджені", () => {
    const rows = buildBom(withLines(), pl, "global");
    const cable = rows.filter((r) => r.section === "Кабель");
    const groups = rows.filter((r) => r.section === "Кола");
    expect(cable).toHaveLength(2);
    expect(groups).toHaveLength(2);
    const sumCable = cable.reduce((s, r) => s + r.quantity, 0);
    const sumGroups = groups.reduce((s, r) => s + r.quantity, 0);
    expect(sumCable).toBeCloseTo(sumGroups, 6);
    expect(rows.filter((r) => r.section === "Бухти").length).toBeGreaterThan(0);
  });

  it("CSV: BOM, крапка з комою, десяткова кома, екранування лапок", () => {
    const csv = bomToCsv([
      { section: "Кабель", name: 'A;"B"', unit: "м", quantity: 31.9, note: "" },
    ]);
    expect(csv.startsWith("﻿Розділ;Назва;Од.;Кількість;Примітка\r\n")).toBe(true);
    expect(csv).toContain('Кабель;"A;""B""";м;31,9;');
  });
});
