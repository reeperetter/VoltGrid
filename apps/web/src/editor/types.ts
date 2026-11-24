import type { ElectricalPointKind, PointMm, WallMaterial } from "@voltgrid/core";

export type Tool =
  | "select"
  | "pan"
  | "calibrate"
  | "wall"
  | "door"
  | "window"
  | "socket"
  | "switch"
  | "light";

export type PlacedPointKind = Extract<ElectricalPointKind, "socket" | "switch" | "light">;

export interface EditorOptions {
  grid: boolean;
  gridMm: number;
  ortho: boolean;
  /** Прозорість підкладки, 0…1. */
  underlayOpacity: number;
}

export interface OpeningParams {
  widthMm: number;
  heightMm: number;
  sillMm: number;
}

/** Параметри інструментів — змінювані користувачем значення за замовчуванням. */
export interface ToolParams {
  wallThicknessMm: number;
  wallMaterial: WallMaterial;
  door: OpeningParams;
  window: OpeningParams;
}

export interface CalibrationState {
  a?: PointMm;
  b?: PointMm;
}

export interface LoadedUnderlay {
  source: HTMLImageElement | HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
  fileName: string;
  /** Для PDF: скільки пікселів зображення припадає на один пункт PDF. */
  pxPerPdfPoint?: number;
}

export const DEFAULT_OPTIONS: EditorOptions = {
  grid: true,
  gridMm: 100,
  ortho: true,
  underlayOpacity: 0.6,
};

export const DEFAULT_TOOL_PARAMS: ToolParams = {
  wallThicknessMm: 200,
  wallMaterial: "brick",
  door: { widthMm: 900, heightMm: 2100, sillMm: 0 },
  window: { widthMm: 1500, heightMm: 1400, sillMm: 900 },
};

export const WALL_MATERIAL_LABELS: Record<WallMaterial, string> = {
  concrete: "Бетон",
  brick: "Цегла",
  aerated: "Газоблок",
  drywall: "Гіпсокартон",
};

export const POINT_KIND_LABELS: Record<ElectricalPointKind, string> = {
  socket: "Розетка",
  switch: "Вимикач",
  light: "Світильник",
  appliance: "Прилад",
  data: "Слабкострумова точка",
};
