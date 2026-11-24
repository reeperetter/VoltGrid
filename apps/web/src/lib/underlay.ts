import type { LoadedUnderlay } from "../editor/types";

const MAX_CANVAS_SIDE_PX = 4096;
const MAX_PDF_SCALE = 2.5;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не вдалося прочитати зображення"));
    img.src = url;
  });
}

async function loadRaster(file: File): Promise<LoadedUnderlay> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    // SVG без заданих розмірів може мати нульові naturalWidth/Height.
    const widthPx = img.naturalWidth || 1000;
    const heightPx = img.naturalHeight || 1000;
    return { source: img, widthPx, heightPx, fileName: file.name };
  } finally {
    // Зображення вже декодоване в пам'яті; URL можна звільнити після onload.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

async function loadPdf(
  file: File,
  askPage: (numPages: number) => number | undefined,
): Promise<LoadedUnderlay> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  let pageNumber = 1;
  if (doc.numPages > 1) {
    const chosen = askPage(doc.numPages);
    if (chosen === undefined) throw new Error("Вибір сторінки скасовано");
    pageNumber = chosen;
  }

  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(MAX_PDF_SCALE, MAX_CANVAS_SIDE_PX / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не вдалося створити полотно для PDF");
  // PDF малює на прозорому фоні — підкладаємо білий.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  void task.destroy();

  return {
    source: canvas,
    widthPx: canvas.width,
    heightPx: canvas.height,
    fileName: file.name,
    pxPerPdfPoint: scale,
  };
}

/** Завантажує креслення (PDF, PNG, JPG, WEBP, SVG) як підкладку. */
export async function loadUnderlay(
  file: File,
  askPage: (numPages: number) => number | undefined,
): Promise<LoadedUnderlay> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return isPdf ? loadPdf(file, askPage) : loadRaster(file);
}

/** Орієнтовний початковий масштаб: ширина креслення ≈ 20 м. Користувач має відкалібрувати. */
export function guessMmPerPx(widthPx: number): number {
  return 20_000 / widthPx;
}
