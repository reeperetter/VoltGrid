import { describe, expect, it } from "vitest";
import { countApartment, decodeText, pointInPolygon, type PlanInsert, type PlanText } from "./count";

const square = [
  { x: 0, y: 0 },
  { x: 10000, y: 0 },
  { x: 10000, y: 8000 },
  { x: 0, y: 8000 },
];

const t = (layer: string, text: string, x: number, y: number): PlanText => ({ layer, text, x, y });

describe("підрахунок квартири", () => {
  it("розбирає форматований текст і точку в полігоні", () => {
    expect(decodeText("{\\fArial|b0|i0|c238|p34;x2}")).toBe("x2");
    expect(pointInPolygon(square, 5000, 4000)).toBe(true);
    expect(pointInPolygon(square, 12000, 4000)).toBe(false);
  });

  it("рахує розетки, подвійні, плиту й освітлення; чужі елементи ігнорує", () => {
    const texts: PlanText[] = [
      t("_E_GNIAZDA-txt", "8/TM", 1000, 1000),
      t("_E_GNIAZDA", "x2", 1100, 1000),
      t("_E_GNIAZDA-txt", "8/TM", 3000, 1000),
      t("_E_GNIAZDA-txt", "7/TM", 5000, 1000),
      t("_E_GNIAZDA", "Z", 5100, 1000),
      t("_E_GNIAZDA-txt", "5/TM", 6000, 1000),
      t("_E_GNIAZDA-txt", "9/TM", 20000, 1000), // сусідня квартира
      t("_E_OŚW-txt", "1/TM", 2000, 4000),
      t("_E_OŚW-id", "a", 2100, 4300),
      t("_E_OŚW-txt", "1/TM", 6000, 4000),
      t("_E_OŚW-id", "g,h", 6100, 4300),
      t("_E_OŚW-id", "a", 500, 7000),
      t("_E_OŚW-id", "g,h", 9000, 7000),
      t("_E_TABLICE-txt", "TM", 500, 500),
      t("_E_TABLICE-txt", "TSM", 800, 500),
    ];
    const inserts: PlanInsert[] = [{ name: "L01_dwg__Domofon-1", layer: "L01_dwg", x: 700, y: 600 }];
    const c = countApartment(texts, inserts, square);
    expect(c.socketsTotal).toBe(3);
    expect(c.socketsDouble).toBe(1);
    expect(c.socketsSingle).toBe(2);
    expect(c.socketsByCircuit).toEqual({ 8: 2, 7: 1 });
    expect(c.appliance.Z).toBe(1);
    expect(c.cooker3f).toBe(1);
    expect(c.lightOutletsTotal).toBe(2);
    expect(c.switchesSingle).toBe(1);
    expect(c.switchesDouble).toBe(1);
    expect(c.tm).toBe(1);
    expect(c.tsm).toBe(1);
    expect(c.intercom).toBe(1);
  });
});
