import { describe, expect, it } from "vitest";
import { getRegionProfile } from "@voltgrid/regions";
import { moveSegment, pathLengthMm, setLinePath } from "./linepath";
import { replaceLevelLines } from "./edit";
import { planLevelRoutes } from "./routing";
import { createSamplePlan } from "./sample";

const P = (xMm: number, yMm: number) => ({ xMm, yMm });

describe("ручне редагування траси", () => {
  it("зсув середньої ланки зберігає ортогональність і кінці", () => {
    const path = [P(0, 0), P(0, 1000), P(3000, 1000), P(3000, 0)];
    const moved = moveSegment(path, 1, 2000)!;
    expect(moved).toEqual([P(0, 0), P(0, 2000), P(3000, 2000), P(3000, 0)]);
    expect(pathLengthMm(moved)).toBe(2000 + 3000 + 2000);
  });

  it("зсув першої ланки додає поворот біля точки", () => {
    const path = [P(0, 0), P(3000, 0), P(3000, 2000)];
    expect(moveSegment(path, 0, 500)).toEqual([P(0, 0), P(0, 500), P(3000, 500), P(3000, 2000)]);
  });

  it("зсув у початкове положення прибирає зайві вершини", () => {
    const path = [P(0, 0), P(0, 500), P(3000, 500), P(3000, 0)];
    expect(moveSegment(path, 1, 0)).toEqual([P(0, 0), P(3000, 0)]);
  });

  it("хибний індекс або похила ланка → undefined", () => {
    expect(moveSegment([P(0, 0), P(1000, 1000)], 0, 5)).toBeUndefined();
    expect(moveSegment([P(0, 0), P(1000, 0)], 3, 5)).toBeUndefined();
  });

  it("setLinePath перераховує обхід, вертикаль лишається", () => {
    const region = getRegionProfile("pl");
    const sample = createSamplePlan(region);
    const levelId = sample.levels[0]!.id;
    const withLines = replaceLevelLines(sample, levelId, planLevelRoutes(sample, region, levelId).lines);
    const line = withLines.lines[0]!;
    const path = line.path!;
    const longer = moveSegment(path, 0, path[0]!.yMm + 700)!;
    const updated = setLinePath(withLines, line.id, longer).lines[0]!;
    expect(updated.segments.verticalMm).toBe(line.segments.verticalMm);
    expect(updated.segments.horizontalMm).toBe(line.segments.horizontalMm);
    expect(updated.segments.detourMm).toBe(pathLengthMm(longer) - line.segments.horizontalMm);
  });
});
