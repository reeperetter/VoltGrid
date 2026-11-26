/**
 * Мінімальне уявлення креслення САПР, незалежне від бібліотеки читання DWG.
 * Веб-шар перетворює результат бібліотеки в ці типи.
 */
export interface CadPoint {
  x: number;
  y: number;
}

export interface CadEntity {
  type: string;
  layer: string;
  [key: string]: unknown;
}

export interface CadBlock {
  basePoint?: CadPoint;
  entities: CadEntity[];
}

export interface CadDrawing {
  /** Одиниці креслення в мм: 1 для мм, 10 для см, 1000 для м тощо. */
  unitToMm: number;
  entities: CadEntity[];
  blocks: Record<string, CadBlock>;
}

/** Відрізок після розгортання блоків; координати в одиницях креслення. */
export interface CadSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
}

export interface CadInsert {
  name: string;
  layer: string;
  x: number;
  y: number;
  /** Кут повороту, радіани (проти годинникової стрілки, у системі креслення). */
  rotation: number;
  scale: number;
  /** Габарит геометрії блока в координатах креслення (якщо він не порожній). */
  bbox?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface FlatDrawing {
  segments: CadSegment[];
  inserts: CadInsert[];
}
