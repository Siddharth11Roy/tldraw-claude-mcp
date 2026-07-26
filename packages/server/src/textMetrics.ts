// Approximate text measurement.
//
// The browser is the source of truth for rendering, but layout has to happen
// server-side — we need node sizes *before* any shape exists in order to place
// them. So we estimate advance widths from tldraw's own font constants.
//
// Values mirror tldraw's `default-shape-constants.ts` (v3.15).

export type SizeName = "s" | "m" | "l" | "xl";
export type FontName = "draw" | "sans" | "serif" | "mono";

export const LABEL_FONT_SIZES: Record<SizeName, number> = { s: 18, m: 22, l: 26, xl: 32 };
export const FONT_SIZES: Record<SizeName, number> = { s: 18, m: 24, l: 36, xl: 44 };
export const ARROW_LABEL_FONT_SIZES: Record<SizeName, number> = { s: 18, m: 20, l: 24, xl: 28 };
export const LINE_HEIGHT = 1.35;
export const LABEL_PADDING = 16;

// Mean advance width as a fraction of font size, per family.
const FAMILY_FACTOR: Record<FontName, number> = {
  draw: 0.56,
  sans: 0.54,
  serif: 0.50,
  mono: 0.60
};

// Per-character advance as a fraction of font size, for a proportional face.
// Crude but far better than a flat average — "Illinois" and "WWWWWWWW" differ
// by ~3x, and a flat factor makes one node overflow and the other look empty.
function charFactor(ch: string): number {
  if (ch === " ") return 0.28;
  if ("iljI|!.,;:'`".includes(ch)) return 0.30;
  if ("ftr()[]{}/\\-\"".includes(ch)) return 0.38;
  if ("mwMW@%".includes(ch)) return 0.85;
  if (ch >= "A" && ch <= "Z") return 0.66;
  if (ch >= "0" && ch <= "9") return 0.55;
  if (ch >= "a" && ch <= "z") return 0.53;
  // CJK and other wide scripts are ~full-width.
  if (ch.codePointAt(0)! > 0x2e80) return 1.0;
  return 0.55;
}

/** Width of a single line of text, in px. */
export function measureLine(text: string, fontSize: number, font: FontName = "draw"): number {
  // Monospace ignores per-character shape.
  if (font === "mono") return text.length * FAMILY_FACTOR.mono * fontSize;
  let units = 0;
  for (const ch of text) units += charFactor(ch);
  // Normalise so the average character lands on the family's mean advance.
  return units * fontSize * (FAMILY_FACTOR[font] / 0.55);
}

export interface MeasuredText {
  w: number;
  h: number;
  lines: string[];
}

/**
 * Word-wrap `text` to at most `maxWidth` px and report the resulting box.
 * Honours explicit newlines. Words longer than `maxWidth` are hard-broken.
 */
export function measureText(
  text: string,
  fontSize: number,
  maxWidth: number,
  font: FontName = "draw"
): MeasuredText {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measureLine(candidate, fontSize, font) <= maxWidth || line === "") {
        // Even alone the word may overflow — hard-break it.
        if (line === "" && measureLine(word, fontSize, font) > maxWidth) {
          let chunk = "";
          for (const ch of word) {
            if (measureLine(chunk + ch, fontSize, font) > maxWidth && chunk !== "") {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = candidate;
        }
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }

  const w = lines.reduce((max, l) => Math.max(max, measureLine(l, fontSize, font)), 0);
  return { w, h: lines.length * fontSize * LINE_HEIGHT, lines };
}

export interface NodeSizeOptions {
  size?: SizeName;
  font?: FontName;
  /** Widest the box may grow before the label wraps. */
  maxWidth?: number;
  minWidth?: number;
  minHeight?: number;
  /** Extra room for shapes whose usable area is smaller than their bounding box. */
  padding?: number;
}

/**
 * Size a geo node so its label fits with tldraw's label padding.
 * Returns whole pixels — fractional sizes make aligned columns look ragged.
 */
export function measureNodeSize(
  text: string,
  opts: NodeSizeOptions = {}
): { w: number; h: number } {
  const size = opts.size ?? "m";
  const font = opts.font ?? "draw";
  const fontSize = LABEL_FONT_SIZES[size];
  const padding = opts.padding ?? LABEL_PADDING;
  const minWidth = opts.minWidth ?? 100;
  const minHeight = opts.minHeight ?? 60;
  const maxWidth = opts.maxWidth ?? 260;

  if (!text) return { w: minWidth, h: minHeight };

  const inner = measureText(text, fontSize, Math.max(40, maxWidth - padding * 2), font);
  return {
    w: Math.max(minWidth, Math.ceil(inner.w + padding * 2)),
    h: Math.max(minHeight, Math.ceil(inner.h + padding * 2))
  };
}

/**
 * Geo shapes other than rectangles waste area: a diamond's inscribed rectangle
 * is half its bounding box, an ellipse's is ~71%. Scale the box so the label
 * still fits inside the drawn outline.
 */
const SHAPE_AREA_FACTOR: Record<string, { w: number; h: number }> = {
  // A diamond's label sits in a band across the middle. Extra height shrinks
  // that band relative to the outline, keeping the text clear of the edges.
  diamond: { w: 1.7, h: 2.3 },
  rhombus: { w: 1.5, h: 1.0 },
  "rhombus-2": { w: 1.5, h: 1.0 },
  ellipse: { w: 1.35, h: 1.35 },
  oval: { w: 1.25, h: 1.1 },
  triangle: { w: 1.8, h: 1.6 },
  trapezoid: { w: 1.35, h: 1.0 },
  pentagon: { w: 1.2, h: 1.2 },
  hexagon: { w: 1.25, h: 1.0 },
  octagon: { w: 1.15, h: 1.15 },
  star: { w: 2.1, h: 2.1 },
  cloud: { w: 1.4, h: 1.5 },
  heart: { w: 1.6, h: 1.8 }
};

export function applyShapeFactor(
  geo: string,
  size: { w: number; h: number }
): { w: number; h: number } {
  const f = SHAPE_AREA_FACTOR[geo];
  if (!f) return size;
  return { w: Math.ceil(size.w * f.w), h: Math.ceil(size.h * f.h) };
}
