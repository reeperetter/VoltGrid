import type { RouteSegments } from "./length";
import type { Project, Riser } from "./project";

/** Службова «група» для стояків у розрахунку кабелю (бухти perGroup, специфікація). */
export const RISER_GROUP_ID = "__risers__";
export const RISER_GROUP_NAME = "Стояки";

/**
 * Довжина стояка між щитами різних поверхів.
 * - вертикаль: різниця абсолютних позначок осей щитів (відмітка поверху + висота встановлення щита);
 * - горизонталь: Манхеттен між положеннями щитів на плані (плани поверхів збігаються в одній системі
 *   координат, шахта окремо не моделюється — див. docs/OPEN-QUESTIONS.md);
 * - обхід 0. Запас додається загальною формулою довжини.
 */
export function riserSegments(project: Project, riser: Riser): RouteSegments | undefined {
  const from = project.points.find((p) => p.id === riser.fromPointId);
  const to = project.points.find((p) => p.id === riser.toPointId);
  if (!from || !to) return undefined;
  const fromLevel = project.levels.find((l) => l.id === from.levelId);
  const toLevel = project.levels.find((l) => l.id === to.levelId);
  if (!fromLevel || !toLevel) return undefined;
  const verticalMm = Math.abs(toLevel.elevationMm + to.heightMm - (fromLevel.elevationMm + from.heightMm));
  const horizontalMm = Math.abs(to.xMm - from.xMm) + Math.abs(to.yMm - from.yMm);
  return { horizontalMm, verticalMm, detourMm: 0 };
}
