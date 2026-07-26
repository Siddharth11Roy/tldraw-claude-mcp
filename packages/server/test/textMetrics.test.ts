import { describe, it, expect } from "vitest";
import { measureText, measureNodeSize, applyShapeFactor, measureLine } from "../src/textMetrics.js";

describe("text measurement", () => {
  it("scales width with content", () => {
    expect(measureLine("WWWW", 22)).toBeGreaterThan(measureLine("iiii", 22));
    expect(measureLine("hello world", 32)).toBeGreaterThan(measureLine("hello world", 16));
  });

  it("wraps at the requested width", () => {
    const { lines, w } = measureText("one two three four five six seven", 22, 120);
    expect(lines.length).toBeGreaterThan(1);
    expect(w).toBeLessThanOrEqual(120);
  });

  it("honours explicit newlines", () => {
    expect(measureText("a\nb\nc", 22, 500).lines).toEqual(["a", "b", "c"]);
  });

  it("hard-breaks a word longer than the line", () => {
    const { lines, w } = measureText("supercalifragilisticexpialidocious", 22, 80);
    expect(lines.length).toBeGreaterThan(1);
    expect(w).toBeLessThanOrEqual(80);
  });

  it("never returns a node smaller than the minimum", () => {
    const size = measureNodeSize("");
    expect(size.w).toBeGreaterThanOrEqual(100);
    expect(size.h).toBeGreaterThanOrEqual(60);
  });

  it("grows a node for a longer label", () => {
    const short = measureNodeSize("Hi");
    const long = measureNodeSize("Validate the incoming webhook signature");
    expect(long.w).toBeGreaterThan(short.w);
  });

  it("enlarges shapes whose usable area is smaller than their bounding box", () => {
    const base = { w: 100, h: 60 };
    expect(applyShapeFactor("diamond", base).w).toBeGreaterThan(base.w);
    expect(applyShapeFactor("ellipse", base).h).toBeGreaterThan(base.h);
    // A rectangle uses its whole box.
    expect(applyShapeFactor("rectangle", base)).toEqual(base);
  });

  it("returns whole pixels so aligned columns do not look ragged", () => {
    const { w, h } = measureNodeSize("Some label here");
    expect(Number.isInteger(w)).toBe(true);
    expect(Number.isInteger(h)).toBe(true);
  });
});
