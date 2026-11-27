import { describe, expect, it } from "vitest";
import { routeApartment } from "./routing";
import type { PlanElement } from "./elements";
import type { RegionMask } from "./regions";

// Дві кімнати 3×3 м, розділені стіною 100 мм з отвором лише як тонка стіна (свердління).
function mask(): RegionMask {
  const C = 50, w = 130, h = 70;
  const data = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const wall = i === 0 || j === 0 || i === w - 1 || j === h - 1 || i === 62 || i === 63;
    data[j * w + i] = wall ? 2 : 1;
  }
  return { x0: 0, y0: 0, cellMm: C, w, h, data };
}
const el = (id: string, kind: PlanElement["kind"], x: number, y: number, circuit?: number): PlanElement => ({ id, kind, x, y, circuit });

describe("routeApartment", () => {
  it("прокладає коло від TM крізь тонку стіну й рахує довжину", () => {
    const res = routeApartment(mask(), [el("tm", "tm", 500, 500), el("s1", "socketSingle", 1500, 1500, 7), el("s2", "socketDouble", 5000, 1500, 7)], []);
    expect(res.unreached).toEqual([]);
    expect(res.legs).toHaveLength(2);
    expect(res.legs[1]!.drills).toBe(1);
    expect(res.byCircuit["7"]!.lengthMm).toBeGreaterThan(5000);
  });
});
