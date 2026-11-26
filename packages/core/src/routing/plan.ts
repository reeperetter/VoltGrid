import type { RegionProfile } from "@voltgrid/regions";
import type { PointMm } from "../geometry";
import type { ElectricalPoint, Group, Line, Project } from "../project";
import { orderChain } from "./chain";
import { DEFAULT_ROUTING_OPTIONS, RoutingGrid, type Bounds, type RoutingOptions } from "./grid";

export type NewLine = Omit<Line, "id">;

export interface RoutePlan {
  lines: NewLine[];
  /** Зрозумілі користувачу попередження (пропущені точки, відсутній щит тощо). */
  warnings: string[];
}

const BOUNDS_MARGIN_MM = 3000;

function boundsOf(points: readonly PointMm[]): Bounds {
  const xs = points.map((p) => p.xMm);
  const ys = points.map((p) => p.yMm);
  return {
    minXMm: Math.min(...xs) - BOUNDS_MARGIN_MM,
    minYMm: Math.min(...ys) - BOUNDS_MARGIN_MM,
    maxXMm: Math.max(...xs) + BOUNDS_MARGIN_MM,
    maxYMm: Math.max(...ys) + BOUNDS_MARGIN_MM,
  };
}

/** Кількість поворотів ламаної (після спрощення кожна внутрішня вершина — поворот). */
export function bendsOf(path: readonly PointMm[]): number {
  return Math.max(0, path.length - 2);
}

function manhattan(a: PointMm, b: PointMm): number {
  return Math.abs(a.xMm - b.xMm) + Math.abs(a.yMm - b.yMm);
}

function resolveCableId(group: Group, points: readonly ElectricalPoint[], region: RegionProfile): string | undefined {
  if (group.cableTypeId) return group.cableTypeId;
  const first = points[0];
  return first ? region.wiring.defaultCableByPointKind[first.kind] : undefined;
}

/**
 * Будує лінії кабелю для всіх кіл поверху.
 *
 * Спрощена модель (див. docs/OPEN-QUESTIONS.md, розділ B):
 * - кожне коло — ланцюжок «найближчий щит → найближча точка → наступна найближча → …»;
 * - траса йде по підлозі ортогонально, на відстані clearance від стін, стіни перетинає лише через двері;
 * - вертикаль кожної ланки = (висота кінця + глибина технічної підлоги) для обох кінців;
 * - обхід = довжина маршруту − відстань за Манхеттеном між кінцями.
 */
export function planLevelRoutes(
  project: Project,
  region: RegionProfile,
  levelId: string,
  options: RoutingOptions = {
    ...DEFAULT_ROUTING_OPTIONS,
    clearanceMm: region.wiring.wallClearanceMm,
    drillMaxThicknessMm: region.wiring.drillMaxThicknessMm,
  },
): RoutePlan {
  const warnings: string[] = [];
  const levelPoints = project.points.filter((p) => p.levelId === levelId);
  const boards = levelPoints.filter((p) => p.kind === "board");
  const consumers = levelPoints.filter((p) => p.kind !== "board");

  if (boards.length === 0) {
    return { lines: [], warnings: ["На поверсі немає щита: додайте щит, щоб побудувати траси."] };
  }

  const unassigned = consumers.filter((p) => p.groupId === undefined).length;
  if (unassigned > 0) {
    warnings.push(`Точок без кола: ${unassigned}. Вони не трасуються — призначте їм коло.`);
  }

  const groupsWithPoints = project.groups
    .map((group) => ({ group, points: consumers.filter((p) => p.groupId === group.id) }))
    .filter((entry) => entry.points.length > 0);

  if (groupsWithPoints.length === 0) {
    return { lines: [], warnings: [...warnings, "Немає кіл із точками: створіть коло й призначте йому точки."] };
  }

  const walls = project.walls.filter((w) => w.levelId === levelId);
  const wallIds = new Set(walls.map((w) => w.id));
  const openings = project.openings.filter((o) => wallIds.has(o.wallId));
  const involved = [...boards, ...groupsWithPoints.flatMap((e) => e.points)].map((p) => ({
    xMm: p.xMm,
    yMm: p.yMm,
  }));
  const grid = new RoutingGrid(boundsOf(involved), walls, openings, options, involved);
  if (!grid.contourClosed) {
    warnings.push("Контур квартири не замкнений стінами — обмеження виходу траси назовні не застосовано.");
  }
  // Кінець лінії по вертикалі: підготовка під стяжку + висота елемента + запас на підключення.
  const endMm = region.wiring.technicalFloorOffsetMm + region.wiring.connectionReserveMm;
  const bendMm = region.wiring.bendAllowanceMm;

  const lines: NewLine[] = [];

  for (const { group, points } of groupsWithPoints) {
    const cableTypeId = resolveCableId(group, points, region);
    if (!cableTypeId || !region.cableTypes.some((c) => c.id === cableTypeId)) {
      warnings.push(`Коло «${group.name}»: не вдалося визначити тип кабелю.`);
      continue;
    }

    const cx = points.reduce((s, p) => s + p.xMm, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.yMm, 0) / points.length;
    const centroid = { xMm: cx, yMm: cy };
    const board = boards.reduce((best, b) =>
      manhattan(b, centroid) < manhattan(best, centroid) ? b : best,
    );
    const boardPos = { xMm: board.xMm, yMm: board.yMm };

    const chain = orderChain(boardPos, points);
    let prev: ElectricalPoint = board;
    for (const next of chain) {
      const from = { xMm: prev.xMm, yMm: prev.yMm };
      const to = { xMm: next.xMm, yMm: next.yMm };
      const target = points.find((p) => p.id === next.id) as ElectricalPoint;
      const route = grid.route(from, to);
      if (!route) {
        warnings.push(
          `Коло «${group.name}»: немає шляху до точки ${next.id} (перевірте двері й стіни).`,
        );
        continue; // наступна ланка рахується від попередньої досяжної точки
      }
      const horizontalMm = manhattan(from, to);
      lines.push({
        levelId,
        groupId: group.id,
        cableTypeId,
        segments: {
          horizontalMm,
          verticalMm: prev.heightMm + endMm + target.heightMm + endMm,
          detourMm: Math.max(0, route.lengthMm - horizontalMm) + bendsOf(route.path) * bendMm,
        },
        path: route.path,
      });
      prev = target;
    }
  }

  return { lines, warnings };
}
