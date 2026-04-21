import { describe, it, expect } from "vitest";
import { Shape } from "../src/shapes.js";

describe("Shape schema", () => {
  it("accepts the documented shape vocabulary", () => {
    const samples: unknown[] = [
      { type: "geo", geo: "rectangle", x: 0, y: 0, w: 10, h: 10 },
      { type: "text", x: 0, y: 0, text: "hi" },
      { type: "arrow", x: 0, y: 0, end: { x: 10, y: 10 } },
      { type: "line", x: 0, y: 0, end: { x: 10, y: 10 } },
      { type: "draw", x: 0, y: 0, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { type: "note", x: 0, y: 0, text: "sticky" }
    ];
    for (const s of samples) expect(() => Shape.parse(s)).not.toThrow();
  });

  it("rejects an unknown shape type", () => {
    expect(() => Shape.parse({ type: "spaceship", x: 0, y: 0 })).toThrow();
  });
});
