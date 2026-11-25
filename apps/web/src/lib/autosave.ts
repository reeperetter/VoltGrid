import { parseProject, serializeProject, type Project } from "@voltgrid/core";

const KEY = "voltgrid.autosave.v1";

/** Автозбережений проєкт або undefined (немає, пошкоджений, сховище недоступне). */
export function loadAutosave(): Project | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseProject(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function saveAutosave(project: Project): boolean {
  try {
    localStorage.setItem(KEY, serializeProject(project));
    return true;
  } catch {
    return false;
  }
}

/** Порожній проєкт не варто зберігати поверх змістовного. */
export function isProjectEmpty(project: Project): boolean {
  return project.walls.length === 0 && project.points.length === 0 && project.openings.length === 0;
}
