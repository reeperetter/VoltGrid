import type { PlanData } from "../cad/plan";
import { extractElements } from "./elements";
import type { FloorReport } from "./report";
import { routeApartment, type ApartmentRoutes, type ApartmentRoutingOptions } from "./routing";

/** Траси однієї квартири (індекс = номер у звіті − 1). */
export function routeOne(plan: PlanData, report: FloorReport, index: number, options: Partial<ApartmentRoutingOptions> = {}): ApartmentRoutes {
  const r = report.regions[index]!;
  const elements = extractElements(
    plan.texts.filter((t) => r.owns(t.x, t.y)),
    plan.inserts.filter((i) => r.owns(i.x, i.y)),
  );
  const windows = plan.lines.filter((l) => l.layer.startsWith("A-GLAZ") && r.owns(l.x1, l.y1));
  return routeApartment(r.mask, elements, windows, options);
}

/** Траси всього поверху. */
export function routeFloor(plan: PlanData, report: FloorReport, options: Partial<ApartmentRoutingOptions> = {}): ApartmentRoutes[] {
  return report.regions.map((_, i) => routeOne(plan, report, i, options));
}
