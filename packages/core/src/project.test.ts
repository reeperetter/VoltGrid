import { describe, expect, it } from "vitest";
import {
  PROJECT_SCHEMA_VERSION,
  createEmptyProject,
  parseProject,
  serializeProject,
} from "./project";

describe("формат проєкту", () => {
  it("створює порожній проєкт актуальної версії", () => {
    const project = createEmptyProject({ id: "p1", name: "ЖК Тест", regionId: "pl" });
    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.levels).toEqual([]);
  });

  it("серіалізація й розбір дають той самий проєкт", () => {
    const project = createEmptyProject({ id: "p1", name: "ЖК Тест", regionId: "pl" });
    project.levels.push({ id: "l1", name: "1-й поверх", elevationMm: 0, ceilingHeightMm: 2700 });
    expect(parseProject(serializeProject(project))).toEqual(project);
  });

  it("відхиляє невідому версію схеми", () => {
    const bad = JSON.stringify({ schemaVersion: 999, id: "p", name: "x", regionId: "pl", levels: [] });
    expect(() => parseProject(bad)).toThrow();
  });

  it("відхиляє дробові міліметри", () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      id: "p",
      name: "x",
      regionId: "pl",
      levels: [{ id: "l", name: "1", elevationMm: 0, ceilingHeightMm: 2700.5 }],
    });
    expect(() => parseProject(bad)).toThrow();
  });
});
