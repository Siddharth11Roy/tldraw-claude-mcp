import { describe, it, expect } from "vitest";
import { Shape, parseShape } from "../src/shapes.js";

describe("Shape schema", () => {
  it("accepts the documented shape vocabulary", () => {
    const samples: unknown[] = [
      { type: "geo", geo: "rectangle", x: 0, y: 0, w: 10, h: 10 },
      { type: "geo", x: 0, y: 0, text: "auto-sized" },
      { type: "text", x: 0, y: 0, text: "hi" },
      { type: "arrow", x: 0, y: 0, end: { x: 10, y: 10 } },
      { type: "arrow", from: "a", to: "b" },
      { type: "line", x: 0, y: 0, end: { x: 10, y: 10 } },
      { type: "line", x: 0, y: 0, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 1 }] },
      { type: "draw", x: 0, y: 0, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { type: "note", x: 0, y: 0, text: "sticky" },
      { type: "frame", x: 0, y: 0, w: 100, h: 100, name: "Group" }
    ];
    for (const s of samples) expect(() => parseShape(s), JSON.stringify(s)).not.toThrow();
  });

  it("rejects an unknown shape type", () => {
    expect(() => parseShape({ type: "spaceship", x: 0, y: 0 })).toThrow();
  });

  it("requires an arrow to have an end or a bound target", () => {
    expect(() => parseShape({ type: "arrow", x: 0, y: 0 })).toThrow();
    expect(() => parseShape({ type: "arrow", from: "a" })).toThrow();
  });

  it("requires a line to have an end or points", () => {
    expect(() => parseShape({ type: "line", x: 0, y: 0 })).toThrow();
  });

  it("covers the full tldraw colour and fill vocabularies", () => {
    // These were previously incomplete, so valid values were rejected server-side.
    for (const color of ["light-red", "white"]) {
      expect(() => parseShape({ type: "geo", x: 0, y: 0, color })).not.toThrow();
    }
    expect(() => parseShape({ type: "geo", x: 0, y: 0, fill: "fill" })).not.toThrow();
    expect(() => parseShape({ type: "geo", x: 0, y: 0, dash: "dotted" })).not.toThrow();
  });

  it("keeps the discriminated union usable for the bulk parse", () => {
    expect(() => Shape.parse({ type: "geo", x: 0, y: 0 })).not.toThrow();
  });
});
