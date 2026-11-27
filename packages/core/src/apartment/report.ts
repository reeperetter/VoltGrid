import type { PlanData } from "../cad/plan";
import { countApartment, decodeText, type ApartmentCounts } from "./count";
import { BARRIER_LAYERS, findApartmentRegions, findEntranceGapVariants, type ApartmentRegion } from "./regions";

export interface ApartmentRow {
  /** Порядковий номер (поки за розташуванням у файлі; правило іменування квартир — окремий крок). */
  index: number;
  areaM2: number;
  tm: { x: number; y: number };
  counts: ApartmentCounts;
  warnings: string[];
}

export interface FloorReport {
  apartments: ApartmentRow[];
  warnings: string[];
  /** Для контролю на екрані: що саме ввійшло в кожну квартиру. */
  regions: ApartmentRegion[];
}

const ALL = [
  { x: -1e12, y: -1e12 },
  { x: 1e12, y: -1e12 },
  { x: 1e12, y: 1e12 },
  { x: -1e12, y: 1e12 },
];

/** Розбір поверху: квартири за контурами від TM, підрахунок компонентів, попередження про підозрілі випадки. */
export function buildFloorReport(plan: PlanData): FloorReport {
  const barriers = plan.lines.filter((l) => BARRIER_LAYERS.includes(l.layer));
  const planTexts = plan.texts.filter((t) => t.layer === "_E_TABLICE-txt");
  // Легенда (праворуч від плану) містить власні «TM»/«TSM» — відкидаємо за відсутністю стін поряд.
  const nearWalls = (p: { x: number; y: number }) =>
    barriers.some((b) => Math.hypot(b.x1 - p.x, b.y1 - p.y) < 4000);
  const tms = planTexts.filter((t) => t.text === "TM" && nearWalls(t));
  const tsms = planTexts.filter((t) => t.text === "TSM" && nearWalls(t));
  const labels = plan.texts.filter(
    (t) => (t.layer === "_E_GNIAZDA-txt" || t.layer === "_E_OŚW-txt") && /^\d{1,2}\/TM$/i.test(decodeText(t.text)),
  );
  // Вхідні двері не розпізнаємо за назвою блока (у PDF її немає): шукаємо проріз у стіні біля TM, перебираючи варіанти.
  const { regions, failed } = findApartmentRegions(barriers, [], tms, tsms, {}, labels, (tm) =>
    findEntranceGapVariants(barriers, tm),
  );

  const warnings: string[] = [];
  const apartments: ApartmentRow[] = regions.map((r, index) => {
    const counts = countApartment(
      plan.texts.filter((t) => r.owns(t.x, t.y)),
      plan.inserts.filter((i) => r.owns(i.x, i.y)),
      ALL,
    );
    const w: string[] = [];
    if (counts.tm !== 1) w.push(`у контурі ${counts.tm} шт. TM — можливо, об'єднано дві квартири (немає розділової стіни в кресленні)`);
    if (counts.tsm !== 1) w.push(`у контурі ${counts.tsm} шт. TSM`);
    if (counts.socketsTotal === 0) w.push("не знайдено жодної розетки");
    if (counts.lightOutletsTotal === 0) w.push("не знайдено виводів освітлення");
    if (r.areaM2 > 75 || counts.socketsTotal > 22) w.push(`площа ${r.areaM2.toFixed(0)} м², розеток ${counts.socketsTotal}: схоже, об'єднано кілька квартир — перевірте`);
    if (r.areaM2 < 18) w.push(`площа лише ${r.areaM2.toFixed(0)} м²: можливо, знайдено лише частину квартири`);
    return { index: index + 1, areaM2: r.areaM2, tm: r.tm, counts, warnings: w };
  });
  for (const f of failed) {
    warnings.push(`Не вдалося визначити контур для TM у точці (${Math.round(f.x)}; ${Math.round(f.y)}) мм — легенда, умовне позначення або квартира без замкненого контуру.`);
  }
  return { apartments, warnings, regions };
}
