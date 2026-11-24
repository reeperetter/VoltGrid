import { z } from "zod";
import { RouteSegmentsSchema } from "./length";

/**
 * Поточна версія формату файлу проєкту.
 * Збільшуємо при будь-якій несумісній зміні схеми й додаємо міграцію.
 */
export const PROJECT_SCHEMA_VERSION = 1;

/** Усі розміри в моделі — цілі міліметри. */
const Millimeters = z.number().int();

export const LevelSchema = z.object({
  id: z.string().min(1),
  /** Назва поверху: «Підвал», «1-й поверх», «Мансарда» тощо. */
  name: z.string().min(1),
  /** Відмітка чистової підлоги поверху від нуля будівлі, мм. */
  elevationMm: Millimeters,
  /** Висота стелі (від чистової підлоги), мм. */
  ceilingHeightMm: Millimeters.positive(),
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
    groups: z.array(GroupSchema),
    lines: z.array(LineSchema),
  })
  .superRefine((project, ctx) => {
    const groupIds = new Set(project.groups.map((g) => g.id));
    project.lines.forEach((line, index) => {
      if (!groupIds.has(line.groupId)) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "groupId"],
          message: `Невідома група: ${line.groupId}`,
        });
      }
    });
  });

export type Level = z.infer<typeof LevelSchema>;
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
