import { pdfToPlanData, type PdfStroke, type PdfText, type PdfWallStyle, type PlanData } from "@voltgrid/core";

/** Читає векторний PDF плану (перша сторінка): тексти з позиціями й відрізки ліній зі стилем. Растрові скани не підходять. */
export async function readPdfPlan(data: ArrayBuffer, scale: number, style?: PdfWallStyle): Promise<PlanData> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined") {
    const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  const doc = await Promise.race([
    task.promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("PDF не відкрився за 60 с: файл завеликий або пошкоджений.")), 60_000),
    ),
  ]);
  const page = await doc.getPage(1);
  const OPS = pdfjs.OPS;

  const content = await page.getTextContent();
  const texts: PdfText[] = [];
  for (const item of content.items) {
    if ("str" in item && item.str.trim() !== "") {
      texts.push({ str: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 });
    }
  }

  const ops = await page.getOperatorList();
  const strokes: PdfStroke[] = [];
  let width = 1;
  let color = "#000000";
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.setLineWidth) width = Number(args[0]);
    else if (fn === OPS.setStrokeRGBColor) color = String(args);
    else if (fn === OPS.constructPath) {
      const path = args[1]?.[0] as ArrayLike<number> | undefined;
      if (!path) continue;
      let j = 0;
      let px = 0;
      let py = 0;
      while (j < path.length) {
        const op = path[j];
        if (op === 0) {
          px = path[j + 1] ?? 0;
          py = path[j + 2] ?? 0;
          j += 3;
        } else if (op === 1) {
          const x = path[j + 1] ?? 0;
          const y = path[j + 2] ?? 0;
          strokes.push({ x1: px, y1: py, x2: x, y2: y, widthPt: width, color });
          px = x;
          py = y;
          j += 3;
        } else if (op === 2) {
          px = path[j + 5] ?? 0;
          py = path[j + 6] ?? 0;
          j += 7;
        } else if (op === 3) {
          px = path[j + 3] ?? 0;
          py = path[j + 4] ?? 0;
          j += 5;
        } else j += 1;
      }
    }
  }
  return pdfToPlanData(texts, strokes, scale, style);
}
