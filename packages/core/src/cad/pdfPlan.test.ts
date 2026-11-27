import { describe, expect, it } from "vitest";
import { classifyPdfText, pdfToPlanData } from "./pdfPlan";

describe("PDF → дані плану", () => {
  it("визначає призначення напису за змістом", () => {
    expect(classifyPdfText("1/TM")).toBe("_E_OŚW-txt");
    expect(classifyPdfText("8/TM")).toBe("_E_GNIAZDA-txt");
    expect(classifyPdfText("x2")).toBe("_E_GNIAZDA");
    expect(classifyPdfText("g,h")).toBe("_E_OŚW-id");
    expect(classifyPdfText("TSM")).toBe("_E_TABLICE-txt");
    expect(classifyPdfText("IT")).toBe("_E_TT");
    expect(classifyPdfText("Kuchnia")).toBeUndefined();
  });

  it("переводить пункти в мм за масштабом і відбирає лінії стін за стилем", () => {
    const plan = pdfToPlanData(
      [{ str: "8/TM", x: 72, y: 144 }, { str: "Pokój", x: 0, y: 0 }],
      [
        { x1: 0, y1: 0, x2: 72, y2: 0, widthPt: 0.51, color: "#666666" },
        { x1: 0, y1: 0, x2: 72, y2: 0, widthPt: 0.28, color: "#666666" },
      ],
      100,
    );
    expect(plan.texts).toHaveLength(1);
    expect(plan.texts[0]!.x).toBeCloseTo(2540, 3); // 72 пт = 1 дюйм = 25,4 мм × 100
    expect(plan.texts[0]!.y).toBeCloseTo(5080, 3);
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]!.x2).toBeCloseTo(2540, 3);
  });
});
