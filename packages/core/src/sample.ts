import type { RegionProfile } from "@voltgrid/regions";
import { addGroup, addLevel, addOpeningAt, addPoint, addWall } from "./edit";
import { createEmptyProject, type Project } from "./project";

/**
 * Синтетичний тестовий план: квартира 8 × 6 м, дві перегородки, двері, вікно, щит, кола й точки.
 * Потрібен для розробки й перевірки редактора, поки немає реального креслення.
 */
export function createSamplePlan(region: RegionProfile): Project {
  let project = createEmptyProject({ id: "sample", name: "Тестова квартира", regionId: region.id });

  const level = addLevel(project, { name: "1-й поверх", ceilingHeightMm: 2700 });
  project = level.project;
  const levelId = level.id;

  const outer = { levelId, thicknessMm: 300, material: "brick" as const };
  const partition = { levelId, thicknessMm: 120, material: "drywall" as const };
  const walls = [
    { ...outer, start: { xMm: 0, yMm: 0 }, end: { xMm: 8000, yMm: 0 } },
    { ...outer, start: { xMm: 8000, yMm: 0 }, end: { xMm: 8000, yMm: 6000 } },
    { ...outer, start: { xMm: 8000, yMm: 6000 }, end: { xMm: 0, yMm: 6000 } },
    { ...outer, start: { xMm: 0, yMm: 6000 }, end: { xMm: 0, yMm: 0 } },
    { ...partition, start: { xMm: 4000, yMm: 0 }, end: { xMm: 4000, yMm: 6000 } },
    { ...partition, start: { xMm: 4000, yMm: 3000 }, end: { xMm: 8000, yMm: 3000 } },
  ];
  for (const wall of walls) project = addWall(project, wall).project;

  const openings = [
    { kind: "door" as const, at: { xMm: 6000, yMm: 6000 }, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { kind: "window" as const, at: { xMm: 2000, yMm: 0 }, widthMm: 1500, heightMm: 1400, sillMm: 900 },
    { kind: "door" as const, at: { xMm: 4000, yMm: 1500 }, widthMm: 900, heightMm: 2100, sillMm: 0 },
    // Без цих дверей нижня права кімната (зі щитом) була б ізольована від решти квартири.
    { kind: "door" as const, at: { xMm: 6000, yMm: 3000 }, widthMm: 900, heightMm: 2100, sillMm: 0 },
  ];
  for (const o of openings) {
    const added = addOpeningAt(project, { levelId, maxDistanceMm: 200, ...o });
    if (!added) throw new Error("Не вдалося розмістити отвір у тестовому плані");
    project = added.project;
  }

  const sockets = addGroup(project, { name: "Розетки" });
  project = sockets.project;
  const lights = addGroup(project, { name: "Освітлення" });
  project = lights.project;

  const { socket, switch: sw, board } = region.mountingHeightsMm;
  const points = [
    { kind: "board" as const, at: { xMm: 7750, yMm: 5600 }, heightMm: board },
    { kind: "socket" as const, at: { xMm: 250, yMm: 1500 }, heightMm: socket, groupId: sockets.id },
    { kind: "socket" as const, at: { xMm: 250, yMm: 4500 }, heightMm: socket, groupId: sockets.id },
    { kind: "socket" as const, at: { xMm: 3800, yMm: 4500 }, heightMm: socket, groupId: sockets.id },
    { kind: "socket" as const, at: { xMm: 4200, yMm: 1500 }, heightMm: socket, groupId: sockets.id },
    { kind: "socket" as const, at: { xMm: 7750, yMm: 1500 }, heightMm: socket, groupId: sockets.id },
    { kind: "socket" as const, at: { xMm: 7750, yMm: 4500 }, heightMm: socket, groupId: sockets.id },
    { kind: "switch" as const, at: { xMm: 3400, yMm: 5850 }, heightMm: sw, groupId: lights.id },
    { kind: "switch" as const, at: { xMm: 5400, yMm: 5850 }, heightMm: sw, groupId: lights.id },
    { kind: "light" as const, at: { xMm: 2000, yMm: 3000 }, heightMm: 2700, groupId: lights.id },
    { kind: "light" as const, at: { xMm: 6000, yMm: 1500 }, heightMm: 2700, groupId: lights.id },
    { kind: "light" as const, at: { xMm: 6000, yMm: 4500 }, heightMm: 2700, groupId: lights.id },
  ];
  for (const p of points) project = addPoint(project, { levelId, ...p }).project;

  return project;
}
