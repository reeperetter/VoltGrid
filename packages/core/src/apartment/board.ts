/** Квартирний щит TM за схемою WMT-PWY-INE-SC-ZA-0034 (YDYżo, MCB, призначення кіл). */
export interface BoardCircuit {
  id: string;
  name: { uk: string; pl: string };
  breakerA: number;
  cable: string;
  /** Орієнтовна площа поперечного перерізу кабеля (по зовнішньому габариту), мм² — для заповнення труби. */
  areaMm2: number;
}

export const DEFAULT_BOARD: BoardCircuit[] = [
  { id: "1", name: { uk: "Освітлення", pl: "Oświetlenie" }, breakerA: 10, cable: "YDYżo 3x1,5", areaMm2: 50 },
  { id: "2", name: { uk: "Холодильник", pl: "Lodówka" }, breakerA: 16, cable: "YDYżo 3x2,5", areaMm2: 65 },
  { id: "3", name: { uk: "Посудомийка", pl: "Zmywarka" }, breakerA: 16, cable: "YDYżo 3x2,5", areaMm2: 65 },
  { id: "4", name: { uk: "Пральна машина", pl: "Pralka" }, breakerA: 16, cable: "YDYżo 3x2,5", areaMm2: 65 },
  { id: "5", name: { uk: "Плита 3ф", pl: "Kuchenka elektryczna 3-fazowa" }, breakerA: 16, cable: "YDYżo 5x2,5", areaMm2: 113 },
  { id: "6", name: { uk: "Розетки ванної", pl: "Gniazda łazienka" }, breakerA: 16, cable: "YDYżo 3x2,5", areaMm2: 65 },
  { id: "7", name: { uk: "Розетки кухні", pl: "Gniazda kuchnia" }, breakerA: 16, cable: "YDYżo 3x2,5", areaMm2: 65 },
  { id: "8", name: { uk: "Розетки вітальні, TSM", pl: "Gniazda salon, TSM" }, breakerA: 16, cable: "YDYżo 3x2,5", areaMm2: 65 },
  { id: "9", name: { uk: "Розетки кімнат", pl: "Gniazda pokoje" }, breakerA: 16, cable: "YDYżo 3x2,5", areaMm2: 65 },
  { id: "10", name: { uk: "Активатор лампи в TSM", pl: "Aktywator lampy błyskowej" }, breakerA: 10, cable: "YDYżo 3x1,5", areaMm2: 50 },
  { id: "11", name: { uk: "Живлення виклику", pl: "Zasilacz systemu przywoławczego" }, breakerA: 10, cable: "YDYżo 3x1,5", areaMm2: 50 },
];

/** Труби: внутрішній діаметр, мм; допустиме заповнення 40 % площі. */
export const CONDUITS = [
  { fi: 20, innerMm: 16.9 },
  { fi: 25, innerMm: 21.4 },
  { fi: 32, innerMm: 28.0 },
] as const;
export const CONDUIT_FILL = 0.4;

/** Найменша труба, у яку влазять кабелі сумарною площею areaMm2; понад fi32 — повертає 32 з ознакою переповнення. */
export function pickConduit(areaMm2: number): { fi: 20 | 25 | 32; overfull: boolean } {
  for (const c of CONDUITS) {
    if (areaMm2 <= CONDUIT_FILL * Math.PI * (c.innerMm / 2) ** 2) return { fi: c.fi, overfull: false };
  }
  return { fi: 32, overfull: true };
}
