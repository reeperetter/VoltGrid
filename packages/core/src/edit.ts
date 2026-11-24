import { distanceMm, projectOnSegment, roundMm, roundPoint, type PointMm } from "./geometry";
import type {
  ElectricalPointKind,
  Level,
  Line,
  Project,
  Underlay,
  WallMaterial,
} from "./project";

/** Результат додавання: нова версія проєкту та ідентифікатор створеного елемента. */
export interface Added {
  project: Project;
  id: string;
}

/** Наступний вільний ідентифікатор виду `<prefix><n>`. */
export function nextId(prefix: string, existing: readonly { id: string }[]): string {
  let max = 0;
  for (const item of existing) {
    if (item.id.startsWith(prefix)) {
      const n = Number(item.id.slice(prefix.length));
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return `${prefix}${max + 1}`;
}

/**
 * Додає поверх. Відмітка підлоги = відмітка попереднього + його висота стелі + товщина перекриття.
 * Товщина перекриття за замовчуванням 300 мм — припущення, змінюється параметром.
 */
export function addLevel(
  project: Project,
  params: { name: string; ceilingHeightMm: number; slabMm?: number },
): Added {
  const last = project.levels[project.levels.length - 1];
  const slabMm = params.slabMm ?? 300;
  const elevationMm = last ? last.elevationMm + last.ceilingHeightMm + slabMm : 0;
  const level: Level = {
    id: nextId("lvl", project.levels),
    name: params.name,
    elevationMm,
    ceilingHeightMm: params.ceilingHeightMm,
  };
  return { project: { ...project, levels: [...project.levels, level] }, id: level.id };
}

export function setLevelUnderlay(
  project: Project,
  levelId: string,
  underlay: Underlay | undefined,
): Project {
  return {
    ...project,
    levels: project.levels.map((l) => {
      if (l.id !== levelId) return l;
      const { underlay: _old, ...rest } = l;
      return underlay ? { ...rest, underlay } : rest;
    }),
  };
}

export function addWall(
  project: Project,
  params: {
    levelId: string;
    start: PointMm;
    end: PointMm;
    thicknessMm: number;
    material: WallMaterial;
  },
): Added {
  const start = roundPoint(params.start);
  const end = roundPoint(params.end);
  if (start.xMm === end.xMm && start.yMm === end.yMm) {
    throw new Error("Стіна має нульову довжину");
  }
  const wall = {
    id: nextId("w", project.walls),
    levelId: params.levelId,
    start,
    end,
    thicknessMm: params.thicknessMm,
    material: params.material,
  };
  return { project: { ...project, walls: [...project.walls, wall] }, id: wall.id };
}

/**
 * Додає отвір у найближчу стіну поверху (не далі за maxDistanceMm від точки).
 * Отвір центрується на проєкції точки й зсувається так, щоб вміститися в стіну.
 * Повертає undefined, якщо стіни поруч немає або отвір ширший за стіну.
 */
export function addOpeningAt(
  project: Project,
  params: {
    levelId: string;
    kind: "door" | "window";
    at: PointMm;
    maxDistanceMm: number;
    widthMm: number;
    heightMm: number;
    sillMm: number;
  },
): Added | undefined {
  let best: { wallId: string; offsetMm: number; lengthMm: number; distance: number } | undefined;
  for (const wall of project.walls) {
    if (wall.levelId !== params.levelId) continue;
    const proj = projectOnSegment(params.at, wall.start, wall.end);
    if (proj.distanceMm > params.maxDistanceMm) continue;
    if (!best || proj.distanceMm < best.distance) {
      best = {
        wallId: wall.id,
        offsetMm: proj.offsetMm,
        lengthMm: distanceMm(wall.start, wall.end),
        distance: proj.distanceMm,
      };
    }
  }
  if (!best || params.widthMm > best.lengthMm) return undefined;

  const offsetMm = roundMm(
    Math.min(Math.max(best.offsetMm - params.widthMm / 2, 0), best.lengthMm - params.widthMm),
  );
  const opening = {
    id: nextId("o", project.openings),
    wallId: best.wallId,
    kind: params.kind,
    offsetMm,
    widthMm: params.widthMm,
    heightMm: params.heightMm,
    sillMm: params.sillMm,
  };
  return { project: { ...project, openings: [...project.openings, opening] }, id: opening.id };
}

export function addPoint(
  project: Project,
  params: {
    levelId: string;
    kind: ElectricalPointKind;
    at: PointMm;
    heightMm: number;
    groupId?: string;
  },
): Added {
  const at = roundPoint(params.at);
  const point = {
    id: nextId("pt", project.points),
    levelId: params.levelId,
    kind: params.kind,
    xMm: at.xMm,
    yMm: at.yMm,
    heightMm: params.heightMm,
    ...(params.groupId !== undefined ? { groupId: params.groupId } : {}),
  };
  return { project: { ...project, points: [...project.points, point] }, id: point.id };
}

export function movePoint(project: Project, id: string, to: PointMm): Project {
  const at = roundPoint(to);
  return {
    ...project,
    points: project.points.map((p) => (p.id === id ? { ...p, xMm: at.xMm, yMm: at.yMm } : p)),
  };
}

export function addGroup(
  project: Project,
  params: { name: string; cableTypeId?: string },
): Added {
  const group = {
    id: nextId("g", project.groups),
    name: params.name,
    ...(params.cableTypeId !== undefined ? { cableTypeId: params.cableTypeId } : {}),
  };
  return { project: { ...project, groups: [...project.groups, group] }, id: group.id };
}

/** Задає або прибирає (undefined) тип кабелю кола. */
export function setGroupCable(
  project: Project,
  groupId: string,
  cableTypeId: string | undefined,
): Project {
  return {
    ...project,
    groups: project.groups.map((g) => {
      if (g.id !== groupId) return g;
      const { cableTypeId: _old, ...rest } = g;
      return cableTypeId !== undefined ? { ...rest, cableTypeId } : rest;
    }),
  };
}

/** Видаляє коло: точки лишаються без кола, лінії кола видаляються. */
export function removeGroup(project: Project, groupId: string): Project {
  return {
    ...project,
    groups: project.groups.filter((g) => g.id !== groupId),
    lines: project.lines.filter((l) => l.groupId !== groupId),
    points: project.points.map((p) => {
      if (p.groupId !== groupId) return p;
      const { groupId: _old, ...rest } = p;
      return rest;
    }),
  };
}

/** Призначає точку колу або знімає призначення (undefined). */
export function setPointGroup(
  project: Project,
  pointId: string,
  groupId: string | undefined,
): Project {
  return {
    ...project,
    points: project.points.map((p) => {
      if (p.id !== pointId) return p;
      const { groupId: _old, ...rest } = p;
      return groupId !== undefined ? { ...rest, groupId } : rest;
    }),
  };
}

/** Замінює всі лінії поверху новими (ідентифікатори присвоюються тут). */
export function replaceLevelLines(
  project: Project,
  levelId: string,
  newLines: readonly Omit<Line, "id">[],
): Project {
  const kept = project.lines.filter((l) => l.levelId !== levelId);
  const lines = [...kept];
  for (const line of newLines) {
    lines.push({ ...line, id: nextId("ln", lines) });
  }
  return { ...project, lines };
}

/** Видаляє стіну (разом з її отворами), отвір або точку за ідентифікатором. */
export function removeById(project: Project, id: string): Project {
  if (project.walls.some((w) => w.id === id)) {
    return {
      ...project,
      walls: project.walls.filter((w) => w.id !== id),
      openings: project.openings.filter((o) => o.wallId !== id),
    };
  }
  if (project.openings.some((o) => o.id === id)) {
    return { ...project, openings: project.openings.filter((o) => o.id !== id) };
  }
  if (project.points.some((p) => p.id === id)) {
    return { ...project, points: project.points.filter((p) => p.id !== id) };
  }
  if (project.lines.some((l) => l.id === id)) {
    return { ...project, lines: project.lines.filter((l) => l.id !== id) };
  }
  return project;
}
