import { describe, expect, it } from "vitest";
import { findApartmentRegions, type Barrier, type DoorSeal } from "./regions";

const rect = (x0: number, y0: number, x1: number, y1: number): Barrier[] => [
  { x1: x0, y1: y0, x2: x1, y2: y0 },
  { x1: x1, y1: y0, x2: x1, y2: y1 },
  { x1: x1, y1: y1, x2: x0, y2: y1 },
  { x1: x0, y1: y1, x2: x0, y2: y0 },
];

describe("контур квартири", () => {
  const tm = { x: 3000, y: 300 };
  const tsm = { x: 3600, y: 300 };

  it("знаходить замкнену кімнату 6×5 м і віддає їй підписи, що лежать у стіні", () => {
    const { regions, failed } = findApartmentRegions(rect(0, 0, 6000, 5000), [], [tm], [tsm]);
    expect(failed).toHaveLength(0);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.areaM2).toBeGreaterThan(28);
    expect(regions[0]!.areaM2).toBeLessThan(31);
    expect(regions[0]!.owns(3000, 2500)).toBe(true);
    expect(regions[0]!.owns(10, 2500)).toBe(true); // розетка в самій стіні
    expect(regions[0]!.owns(9000, 2500)).toBe(false);
  });

  it("вхідні двері запечатуються, інакше заливка тече в коридор", () => {
    // Квартира з прорізом у нижній стіні (двері), за яким величезний відкритий простір.
    const walls: Barrier[] = [
      { x1: 0, y1: 0, x2: 2500, y2: 0 },
      { x1: 3400, y1: 0, x2: 6000, y2: 0 },
      { x1: 6000, y1: 0, x2: 6000, y2: 5000 },
      { x1: 6000, y1: 5000, x2: 0, y2: 5000 },
      { x1: 0, y1: 5000, x2: 0, y2: 0 },
      // зовнішній «корпус» дуже великий — квартира не має бути злита з ним
      ...rect(-30000, -30000, 40000, 40000),
    ];
    const open = findApartmentRegions(walls, [], [tm], [tsm]);
    expect(open.regions).toHaveLength(0);
    const seal: DoorSeal = { x: 2500, y: 0, angle: 0, widthMm: 900 };
    const sealed = findApartmentRegions(walls, [seal], [tm], [tsm]);
    expect(sealed.regions).toHaveLength(1);
    expect(sealed.regions[0]!.areaM2).toBeLessThan(31);
  });
});
