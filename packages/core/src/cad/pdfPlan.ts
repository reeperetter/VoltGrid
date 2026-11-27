import type { FlatLine, FlatText, PlanData } from "./plan";

export interface PdfText {
  str: string;
  /** Координати в пунктах PDF (початок унизу ліворуч, y вгору). */
  x: number;
  y: number;
}

export interface PdfStroke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  widthPt: number;
  /** Колір штриха у вигляді «#rrggbb». */
  color: string;
}

export interface PdfWallStyle {
  /** Стилі штриха «товщина|колір» (товщина з точністю до сотих), якими накреслено стіни, вікна й рамки дверей. */
  styles: readonly string[];
}

/** Стилі ліній, якими в цьому проєкті накреслено стіни, вікна й рамки дверей (визначено порівнянням PDF із DWG). */
export const DEFAULT_PDF_WALL_STYLE: PdfWallStyle = {
  styles: ["0.51|#666666", "0.51|#6666b2", "0.28|#7b7b7b", "0.28|#c5c5c5", "0.28|#b2b2b2"],
};

/** Шар, який мало б тут текст у DWG, — виводимо за змістом напису, бо в PDF шарів немає. */
export function classifyPdfText(str: string): string | undefined {
  const t = str.trim();
  if (/^1\/TM$/i.test(t)) return "_E_OŚW-txt";
  if (/^[2-9]\/TM$/i.test(t) || /^1[01]\/TM$/i.test(t)) return "_E_GNIAZDA-txt";
  if (/^x2(\s*OK)?$/i.test(t) || /^(L|Z|P|OK)$/.test(t)) return "_E_GNIAZDA";
  if (/^[a-z](,[a-z])*$/.test(t)) return "_E_OŚW-id";
  if (t === "IT" || t === "RTV") return "_E_TT";
  if (t === "TM" || t === "TSM") return "_E_TABLICE-txt";
  return undefined;
}

/**
 * Перетворює вміст векторного PDF плану на ті самі плоскі дані, що дає DWG.
 * `scale` — знаменник масштабу креслення (100 для М 1:100). Вставок (блоків) у PDF немає,
 * тому символи без підпису (домофон, датчики, настінні виводи) з PDF не розпізнаються.
 */
export function pdfToPlanData(
  texts: readonly PdfText[],
  strokes: readonly PdfStroke[],
  scale: number,
  style: PdfWallStyle = DEFAULT_PDF_WALL_STYLE,
): PlanData {
  const k = (25.4 / 72) * scale; // мм на пункт PDF
  const out: PlanData = { texts: [], inserts: [], lines: [] };
  for (const t of texts) {
    const layer = classifyPdfText(t.str);
    if (!layer) continue;
    const ft: FlatText = { layer, text: t.str.trim(), x: t.x * k, y: t.y * k };
    out.texts.push(ft);
  }
  for (const s of strokes) {
    if (!style.styles.includes(`${s.widthPt.toFixed(2)}|${s.color}`)) continue;
    const fl: FlatLine = { layer: "A-WALL", x1: s.x1 * k, y1: s.y1 * k, x2: s.x2 * k, y2: s.y2 * k };
    out.lines.push(fl);
  }
  return out;
}
