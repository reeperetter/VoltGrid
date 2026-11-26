export type CadItemKind = "door" | "window" | "board" | "light" | "socket" | "switch";

export interface CadItemClass {
  kind: CadItemKind;
  /** Розмір із назви блока («90x200» → 900×2000 мм), якщо вдалося розпізнати. */
  widthMm?: number;
  heightMm?: number;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function parseSize(name: string): { widthMm: number; heightMm: number } | undefined {
  const m = /(\d{2,4})\s*x\s*(\d{2,4})/i.exec(name);
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // «90x200» — сантиметри; «900x2100» — вже міліметри.
  const k = a >= 400 || b >= 400 ? 1 : 10;
  return { widthMm: a * k, heightMm: b * k };
}

/**
 * Розпізнає вставку за шаром і назвою блока (польські назви з Revit).
 * Лише попередня класифікація: користувач бачить підсумок імпорту й може виправити на плані.
 */
export function classifyInsert(name: string, layer: string): CadItemClass | undefined {
  const n = normalize(name);
  const l = layer.toUpperCase();
  const size = parseSize(name);
  const withSize = (kind: CadItemKind): CadItemClass => ({ kind, ...(size ?? {}) });

  if (/dzwig|kone/.test(n)) return undefined; // ліфт
  if (l.includes("ANNO") || l.includes("TTLB")) return undefined; // позначки, рамки

  if (l.startsWith("A-DOOR") || /(^|[^a-z])(drzwi|door|dwm\d?)([^a-z]|$)/.test(n)) return withSize("door");
  if ((l.startsWith("A-GLAZ") && !l.includes("CWMG")) || /(^|[^a-z])(okno|okna|window)([^a-z]|$)/.test(n)) {
    return withSize("window");
  }
  if (/rozdzielnic/.test(n)) return { kind: "board" };
  if (/gniazd|socket|outlet/.test(n)) return { kind: "socket" };
  if (/lacznik|przelacznik|switch/.test(n)) return { kind: "switch" };
  if (l.startsWith("E-LITE") || /oprawa|wypust osw|osw - wypust/.test(n)) return { kind: "light" };
  return undefined;
}
