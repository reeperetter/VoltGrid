/**
 * Підрахунок компонентів однієї квартири за готовим планом (DWG з Revit): символи розеток і
 * світильників мають підписи — номер кола «N/TM», «x2» для подвійних, літери вимикачів тощо.
 * Модуль працює з плоскими даними (текст і вставки з координатами в мм), без залежності від формату файла.
 */

export interface PlanText {
  layer: string;
  text: string;
  x: number;
  y: number;
}

export interface PlanInsert {
  name: string;
  layer: string;
  x: number;
  y: number;
}

export type Polygon = readonly { x: number; y: number }[];

/** Призначення кола за схемою TM (WMT-PWY-INE-SC-ZA-0034). */
export const CIRCUIT_PURPOSE: Readonly<Record<number, string>> = {
  1: "oświetlenie",
  2: "lodówka",
  3: "zmywarka",
  4: "pralka",
  5: "kuchenka 3f",
  6: "łazienka",
  7: "kuchnia",
  8: "salon/TSM",
  9: "pokoje",
};

export interface ApartmentCounts {
  /** Розетки 230 В (разом із подвійними, без плити 3f). */
  socketsTotal: number;
  socketsSingle: number;
  socketsDouble: number;
  /** Розетки за колами (ключ — номер кола). */
  socketsByCircuit: Record<number, number>;
  /** Позначки техніки біля розеток: L — холодильник, Z — посудомийка, P — пральня, OK — витяжка. */
  appliance: { L: number; Z: number; P: number; OK: number };
  cooker3f: number;
  lightOutletsTotal: number;
  lightOutletsWall: number;
  lightOutletsCeiling: number;
  /** Вимикачі: кожен пристрій — окрема точка; подвійні (g,h) рахуються як клавішні. */
  switchesSingle: number;
  switchesDouble: number;
  it: number;
  rtv: number;
  tm: number;
  tsm: number;
  intercom: number;
  smokeDetectors: number;
}

export function decodeText(raw: string): string {
  return raw
    .replace(/\\[fFHWQTACc][^;]*;/g, "")
    .replace(/\\P/g, " ")
    .replace(/[{}]/g, "")
    .trim();
}

export function pointInPolygon(poly: Polygon, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const CIRCUIT_RE = /^(\d{1,2})\/TM$/i;
const MATCH_RADIUS_MM = 1300;

export function countApartment(
  texts: readonly PlanText[],
  inserts: readonly PlanInsert[],
  region: Polygon,
): ApartmentCounts {
  const T = texts
    .filter((t) => pointInPolygon(region, t.x, t.y))
    .map((t) => ({ ...t, text: decodeText(t.text) }));
  const I = inserts.filter((i) => pointInPolygon(region, i.x, i.y));

  const counts: ApartmentCounts = {
    socketsTotal: 0,
    socketsSingle: 0,
    socketsDouble: 0,
    socketsByCircuit: {},
    appliance: { L: 0, Z: 0, P: 0, OK: 0 },
    cooker3f: 0,
    lightOutletsTotal: 0,
    lightOutletsWall: 0,
    lightOutletsCeiling: 0,
    switchesSingle: 0,
    switchesDouble: 0,
    it: 0,
    rtv: 0,
    tm: 0,
    tsm: 0,
    intercom: 0,
    smokeDetectors: 0,
  };

  // Розетки: підпис кола на шарі _E_GNIAZDA-txt.
  for (const t of T) {
    if (t.layer !== "_E_GNIAZDA-txt") continue;
    const m = CIRCUIT_RE.exec(t.text);
    if (!m) continue;
    const circuit = Number(m[1]);
    if (circuit === 5) {
      counts.cooker3f++;
      continue;
    }
    counts.socketsByCircuit[circuit] = (counts.socketsByCircuit[circuit] ?? 0) + 1;
    counts.socketsTotal++;
  }
  for (const t of T) {
    if (t.layer !== "_E_GNIAZDA") continue;
    if (/^x2/i.test(t.text)) counts.socketsDouble++;
    if (t.text === "L") counts.appliance.L++;
    else if (t.text === "Z") counts.appliance.Z++;
    else if (t.text === "P") counts.appliance.P++;
    if (/\bOK\b/i.test(t.text)) counts.appliance.OK++;
  }
  counts.socketsSingle = Math.max(0, counts.socketsTotal - counts.socketsDouble);

  // Освітлення: кожен підпис «1/TM» — один вивід; найближча літера-мітка належить йому, решта — вимикачі.
  const outlets = T.filter((t) => t.layer === "_E_OŚW-txt" && CIRCUIT_RE.test(t.text));
  const ids = T.filter((t) => t.layer === "_E_OŚW-id" && /^[a-z](,[a-z])*$/i.test(t.text));
  const taken = new Set<number>();
  const pairs = outlets
    .flatMap((o, oi) =>
      ids.map((id, ii) => ({ oi, ii, d: Math.hypot(o.x - id.x, o.y - id.y) })),
    )
    .filter((p) => p.d <= MATCH_RADIUS_MM)
    .sort((a, b) => a.d - b.d);
  const usedOutlet = new Set<number>();
  for (const p of pairs) {
    if (usedOutlet.has(p.oi) || taken.has(p.ii)) continue;
    usedOutlet.add(p.oi);
    taken.add(p.ii);
  }
  counts.lightOutletsTotal = outlets.length;
  counts.lightOutletsWall = I.filter((i) => /osw scienny|naścienn|nascienn/i.test(i.name)).length;
  counts.lightOutletsCeiling = Math.max(0, counts.lightOutletsTotal - counts.lightOutletsWall);
  ids.forEach((id, idx) => {
    if (taken.has(idx)) return;
    if (id.text.includes(",")) counts.switchesDouble++;
    else counts.switchesSingle++;
  });

  for (const t of T) {
    if (t.layer === "_E_TT" && t.text === "IT") counts.it++;
    else if (t.layer === "_E_TT" && t.text === "RTV") counts.rtv++;
    else if (t.layer === "_E_TABLICE-txt" && t.text === "TM") counts.tm++;
    else if (t.layer === "_E_TABLICE-txt" && t.text === "TSM") counts.tsm++;
  }
  counts.intercom = I.filter((i) => /domofon|unifon/i.test(i.name)).length;
  counts.smokeDetectors = I.filter((i) => /czujka_optyczna|czujka optyczna|detektor dymu/i.test(i.name)).length;
  return counts;
}
