import { decodeText, type PlanInsert, type PlanText } from "./count";

export type ElementKind =
  | "tm"
  | "tsm"
  | "socketSingle"
  | "socketDouble"
  | "cooker3f"
  | "lightOutlet"
  | "switchSingle"
  | "switchDouble"
  | "it"
  | "rtv";

export interface PlanElement {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  /** Номер кола щита (1–11) для розеток, плити й виводів світла. */
  circuit?: number;
  /** Літери вимикача/виводу («g,h»): за ними зв'язуються вимикачі зі світильниками. */
  keys?: string;
  /** Позначка техніки біля розетки: L, Z, P, OK. */
  appliance?: string;
  wall?: boolean;
}

export const KIND_LABEL: Record<ElementKind, { uk: string; pl: string; en: string }> = {
  tm: { uk: "Квартирний щит TM", pl: "Tablica mieszkaniowa TM", en: "Apartment board TM" },
  tsm: { uk: "Телекомунікаційна скринька TSM", pl: "Skrzynka telekomunikacyjna TSM", en: "Telecom box TSM" },
  socketSingle: { uk: "Розетка одинарна", pl: "Gniazdo pojedyncze", en: "Single socket" },
  socketDouble: { uk: "Розетка подвійна", pl: "Gniazdo podwójne", en: "Double socket" },
  cooker3f: { uk: "Плита 3F", pl: "Puszka 3-fazowa (płyta)", en: "3-phase cooker box" },
  lightOutlet: { uk: "Вивід освітлення", pl: "Wypust oświetleniowy", en: "Lighting outlet" },
  switchSingle: { uk: "Вимикач одноклавішний", pl: "Łącznik pojedynczy", en: "Single switch" },
  switchDouble: { uk: "Вимикач двоклавішний", pl: "Łącznik podwójny", en: "Double switch" },
  it: { uk: "Розетка IT", pl: "Gniazdo IT", en: "IT socket" },
  rtv: { uk: "Розетка RTV/SAT", pl: "Gniazdo RTV/SAT", en: "RTV/SAT socket" },
};

const CIRCUIT_RE = /^(\d{1,2})\/TM$/i;

interface Pair {
  a: number;
  b: number;
  d: number;
}

/** Жадібне зіставлення «найближчий до найближчого» в межах радіуса: кожен елемент у ≤ 1 парі. */
function matchNearest(
  as: readonly { x: number; y: number }[],
  bs: readonly { x: number; y: number }[],
  radius: number,
): Map<number, number> {
  const pairs: Pair[] = [];
  as.forEach((a, i) => {
    bs.forEach((b, j) => {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d <= radius) pairs.push({ a: i, b: j, d });
    });
  });
  pairs.sort((p, q) => p.d - q.d);
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const out = new Map<number, number>();
  for (const p of pairs) {
    if (usedA.has(p.a) || usedB.has(p.b)) continue;
    usedA.add(p.a);
    usedB.add(p.b);
    out.set(p.a, p.b);
  }
  return out;
}

/**
 * Елементи плану з координатами. Підписи кола «N/TM» — це самі розетки/виводи; «x2» і літери техніки
 * прив'язуються до найближчого; літери без виводу поруч — вимикачі.
 */
export function extractElements(texts: readonly PlanText[], inserts: readonly PlanInsert[] = []): PlanElement[] {
  const T = texts.map((t) => ({ ...t, text: decodeText(t.text) }));
  const out: PlanElement[] = [];
  let n = 0;
  const id = (p: string) => `${p}${++n}`;

  const sockLabels = T.filter((t) => t.layer === "_E_GNIAZDA-txt" && CIRCUIT_RE.test(t.text));
  const x2 = T.filter((t) => t.layer === "_E_GNIAZDA" && /^x2/i.test(t.text));
  const mods = T.filter((t) => t.layer === "_E_GNIAZDA" && /^(L|Z|P)$|\bOK\b/.test(t.text));
  const dbl = matchNearest(sockLabels, x2, 900);
  const modOf = matchNearest(sockLabels, mods, 900);
  sockLabels.forEach((l, i) => {
    const circuit = Number(CIRCUIT_RE.exec(l.text)![1]);
    const m = modOf.get(i);
    const el: PlanElement = {
      id: id("s"),
      kind: circuit === 5 ? "cooker3f" : dbl.has(i) ? "socketDouble" : "socketSingle",
      x: l.x,
      y: l.y,
      circuit,
    };
    if (m !== undefined) el.appliance = mods[m]!.text;
    out.push(el);
  });

  const outletLabels = T.filter((t) => t.layer === "_E_OŚW-txt" && CIRCUIT_RE.test(t.text));
  const ids = T.filter((t) => t.layer === "_E_OŚW-id" && /^[a-z](,[a-z])*$/i.test(t.text));
  const idOf = matchNearest(outletLabels, ids, 1300);
  const wallInserts = inserts.filter((i) => /osw scienny|naścienn|nascienn/i.test(i.name));
  const wallOf = matchNearest(outletLabels, wallInserts, 1200);
  outletLabels.forEach((l, i) => {
    const k = idOf.get(i);
    const el: PlanElement = { id: id("l"), kind: "lightOutlet", x: l.x, y: l.y, circuit: 1 };
    if (k !== undefined) el.keys = ids[k]!.text;
    if (wallOf.has(i)) el.wall = true;
    out.push(el);
  });
  const usedIds = new Set(idOf.values());
  ids.forEach((t, i) => {
    if (usedIds.has(i)) return;
    out.push({ id: id("w"), kind: t.text.includes(",") ? "switchDouble" : "switchSingle", x: t.x, y: t.y, keys: t.text });
  });

  for (const t of T) {
    if (t.layer === "_E_TT" && t.text === "IT") out.push({ id: id("i"), kind: "it", x: t.x, y: t.y });
    else if (t.layer === "_E_TT" && t.text === "RTV") out.push({ id: id("r"), kind: "rtv", x: t.x, y: t.y });
    else if (t.layer === "_E_TABLICE-txt" && t.text === "TM") out.push({ id: id("b"), kind: "tm", x: t.x, y: t.y });
    else if (t.layer === "_E_TABLICE-txt" && t.text === "TSM") out.push({ id: id("m"), kind: "tsm", x: t.x, y: t.y });
  }
  return out;
}
