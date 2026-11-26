import type { ApartmentCounts } from "./count";

export interface ReportColumn {
  key: string;
  /** Назва за легендою проєкту (польською) — для колеги. */
  label: string;
  /** Пояснення українською — для екрана. */
  hint: string;
  value(c: ApartmentCounts): number;
}

/** Один тип компонента — один стовпець; порядок зліва направо — як у легенді «mieszkania». */
export const REPORT_COLUMNS: readonly ReportColumn[] = [
  { key: "tm", label: "Tablica mieszkaniowa TM", hint: "Квартирний щит", value: (c) => c.tm },
  { key: "tsm", label: "Skrzynka telekomunikacyjna TSM", hint: "Телекомунікаційна скринька", value: (c) => c.tsm },
  { key: "tsm230", label: "Gniazdo 230 V w TSM", hint: "Розетка 230 В у TSM (завжди 1 на TSM)", value: (c) => c.tsm },
  { key: "unifon", label: "Unifon abonencki", hint: "Домофонна трубка", value: (c) => c.intercom },
  { key: "smoke", label: "Detektor dymu", hint: "Датчик диму", value: (c) => c.smokeDetectors },
  { key: "sockSingle", label: "Gniazdo 2P+Z 16 A pojedyncze", hint: "Розетка одинарна", value: (c) => c.socketsSingle },
  { key: "sockDouble", label: "Gniazdo 2P+Z 16 A podwójne (x2)", hint: "Розетка подвійна", value: (c) => c.socketsDouble },
  { key: "fridge", label: "w tym: lodówka (L)", hint: "з них: холодильник", value: (c) => c.appliance.L },
  { key: "dishwasher", label: "w tym: zmywarka (Z)", hint: "з них: посудомийка", value: (c) => c.appliance.Z },
  { key: "washer", label: "w tym: pralka (P)", hint: "з них: пральня", value: (c) => c.appliance.P },
  { key: "hood", label: "w tym: okap (OK)", hint: "з них: витяжка", value: (c) => c.appliance.OK },
  { key: "cooker", label: "Puszka 3-fazowa 16 A / 400 V", hint: "Плита 3f (коло 5)", value: (c) => c.cooker3f },
  { key: "it", label: "Gniazdo IT", hint: "Розетка IT", value: (c) => c.it },
  { key: "rtv", label: "Gniazdo RTV/SAT", hint: "Розетка RTV/SAT", value: (c) => c.rtv },
  { key: "lightWall", label: "Wypust oświetleniowy ścienny", hint: "Вивід освітлення настінний", value: (c) => c.lightOutletsWall },
  { key: "lightCeiling", label: "Wypust oświetleniowy sufitowy", hint: "Вивід освітлення стельовий", value: (c) => c.lightOutletsCeiling },
  { key: "swSingle", label: "Łącznik pojedynczy", hint: "Вимикач одноклавішний", value: (c) => c.switchesSingle },
  { key: "swDouble", label: "Łącznik podwójny", hint: "Вимикач двоклавішний", value: (c) => c.switchesDouble },
];
