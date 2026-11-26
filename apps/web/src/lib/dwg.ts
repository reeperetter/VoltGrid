import { extractPlanData, type DwgLikeDatabase, type PlanData } from "@voltgrid/core";

/** Читає DWG через LibreDWG (WASM, GPL-3.0; завантажується лише при імпорті) і повертає плоскі дані плану. */
export async function readDwgPlan(file: File): Promise<PlanData> {
  const { LibreDwg, Dwg_File_Type } = await import("@mlightcad/libredwg-web");
  const lib = await LibreDwg.create();
  const buffer = await file.arrayBuffer();
  const data = lib.dwg_read_data(buffer, Dwg_File_Type.DWG);
  if (data == null) throw new Error("Не вдалося прочитати DWG: файл пошкоджений або непідтримувана версія.");
  const db = lib.convert(data) as unknown as DwgLikeDatabase;
  return extractPlanData(db);
}
