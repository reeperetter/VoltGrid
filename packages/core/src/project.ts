import { z } from "zod";
import { distanceMm } from "./geometry";
import { RouteSegmentsSchema } from "./length";

/**
 * Поточна версія формату файлу проєкту.
 * Збільшуємо при будь-якій несумісній зміні схеми й додаємо міграцію.
 */
export const PROJECT_SCHEMA_VERSION = 1;

/** Усі розміри в моделі — цілі міліметри. */
const Millimeters = z.number().int();

export const PointMmSchema = z.object({ xMm: Millimeters, yMm: Millimeters });

/** Підкладка (креслення) поверху. Саме зображення в файлі проєкту не зберігається. */
export const UnderlaySchema = z.object({
  fileName: z.string().min(1),
  /** Масштаб: міліметрів реального розміру в одному пікселі зображення. */
  mmPerPx: z.number().positive(),
});

export const LevelSchema = z.object({
  id: z.string().min(1),
  /** Назва поверху: «Підвал», «1-й поверх», «Мансарда» тощо. */
  name: z.string().min(1),
  /** Відмітка чистової підлоги поверху від нуля будівлі, мм. */
  elevationMm: Millimeters,
  /** Висота стелі (від чистової підлоги), мм. */
  ceilingHeightMm: Millimeters.positive(),
  underlay: UnderlaySchema.optional(),
});

export const WallMaterialSchema = z.enum(["concrete", "brick", "aerated", "drywall"]);

export const WallSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  start: PointMmSchema,
  end: PointMmSchema,
  thicknessMm: Millimeters.positive(),
  material: WallMaterialSchema,
});

export const OpeningSchema = z.object({
  id: z.string().min(1),
  wallId: z.string().min(1),
  kind: z.enum(["door", "window"]),
  /** Відстань від початку стіни до початку отвору, мм. */
  offsetMm: Millimeters.nonnegative(),
  widthMm: Millimeters.positive(),
  heightMm: Millimeters.positive(),
  /** Висота підвіконня від чистової підлоги, мм (для дверей 0). */
  sillMm: Millimeters.nonnegative(),
});

export const ElectricalPointKindSchema = z.enum([
  "socket",
  "switch",
  "light",
  "appliance",
  "data",
]);

/** Точка встановлення: розетка, вимикач, світильник, прилад, слабкострумова точка. */
export const ElectricalPointSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  kind: ElectricalPointKindSchema,
  xMm: Millimeters,
  yMm: Millimeters,
  /** Висота встановлення від чистової підлоги, мм. */
  heightMm: Millimeters.nonnegative(),
  groupId: z.string().min(1).optional(),
});

/** Група (електричне коло): розетки кухні, освітлення кімнати, стояк тощо. */
export const GroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

/** Лінія кабелю від щита до точки (або між точками) з розкладкою траси. */
export const LineSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  cableTypeId: z.string().min(1),
  segments: RouteSegmentsSchema,
});

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
    id: z.string().min(1),
    name: z.string().min(1),
    /** Ідентифікатор регіонального профілю норм, напр. "pl". */
    regionId: z.string().min(1),
    levels: z.array(LevelSchema),
    walls: z.array(WallSchema),
    openings: z.array(OpeningSchema),
    points: z.array(ElectricalPointSchema),
    groups: z.array(GroupSchema),
    lines: z.array(LineSchema),
  })
  .superRefine((project, ctx) => {
    const levelIds = new Set(project.levels.map((l) => l.id));
    const groupIds = new Set(project.groups.map((g) => g.id));
    const wallsById = new Map(project.walls.map((w) => [w.id, w]));

    project.lines.forEach((line, index) => {
      if (!groupIds.has(line.groupId)) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "groupId"],
          message: `Невідома група: ${line.groupId}`,
        });
      }
    });

    project.walls.forEach((wall, index) => {
      if (!levelIds.has(wall.levelId)) {
        ctx.addIssue({
          code: "custom",
          path: ["walls", index, "levelId"],
          message: `Невідомий поверх: ${wall.levelId}`,
        });
      }
      if (wall.start.xMm === wall.end.xMm && wall.start.yMm === wall.end.yMm) {
        ctx.addIssue({
          code: "custom",
          path: ["walls", index],
          message: "Стіна має нульову довжину",
        });
      }
    });

    project.points.forEach((point, index) => {
      if (!levelIds.has(point.levelId)) {
        ctx.addIssue({
          code: "custom",
          path: ["points", index, "levelId"],
          message: `Невідомий поверх: ${point.levelId}`,
        });
      }
      if (point.groupId !== undefined && !groupIds.has(point.groupId)) {
        ctx.addIssue({
          code: "custom",
          path: ["points", index, "groupId"],
          message: `Невідома група: ${point.groupId}`,
        });
      }
    });

    project.openings.forEach((opening, index) => {
      const wall = wallsById.get(opening.wallId);
      if (!wall) {
        ctx.addIssue({
          code: "custom",
          path: ["openings", index, "wallId"],
          message: `Невідома стіна: ${opening.wallId}`,
        });
        return;
      }
      // Допуск 1 мм на округлення довжини похилих стін.
      if (opening.offsetMm + opening.widthMm > distanceMm(wall.start, wall.end) + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["openings", index],
          message: "Отвір виходить за межі стіни",
        });
      }
    });
  });

export type PointMmValue = z.infer<typeof PointMmSchema>;
export type Underlay = z.infer<typeof UnderlaySchema>;
export type Level = z.infer<typeof LevelSchema>;
export type WallMaterial = z.infer<typeof WallMaterialSchema>;
export type Wall = z.infer<typeof WallSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type ElectricalPointKind = z.infer<typeof ElectricalPointKindSchema>;
export type ElectricalPoint = z.infer<typeof ElectricalPointSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type Line = z.infer<typeof LineSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export function createEmptyProject(params: {
  id: string;
  name: string;
  regionId: string;
}): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: params.id,
    name: params.name,
    regionId: params.regionId,
    levels: [],
    walls: [],
    openings: [],
    points: [],
    groups: [],
    lines: [],
  };
}

/** Розбирає JSON-рядок файлу проєкту; кидає помилку, якщо формат невалідний. */
export function parseProject(json: string): Project {
  return ProjectSchema.parse(JSON.parse(json));
}

export function serializeProject(project: Project): string {
  return JSON.stringify(ProjectSchema.parse(project), null, 2);
}
