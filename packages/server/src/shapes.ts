import { z } from "zod";

// Enum values mirror tldraw v3.15's style validators exactly. Anything not in
// these lists is rejected by the browser and fails the whole batch, so they are
// worth keeping in sync with @tldraw/tlschema.

export const ColorEnum = z.enum([
  "black", "grey", "light-violet", "violet", "blue", "light-blue",
  "yellow", "orange", "green", "light-green", "light-red", "red", "white"
]);

export const FillEnum = z.enum(["none", "semi", "solid", "pattern", "fill"]);
export const DashEnum = z.enum(["draw", "solid", "dashed", "dotted"]);
export const SizeEnum = z.enum(["s", "m", "l", "xl"]);
export const FontEnum = z.enum(["draw", "sans", "serif", "mono"]);
export const AlignEnum = z.enum(["start", "middle", "end"]);
export const VerticalAlignEnum = z.enum(["start", "middle", "end"]);
export const SplineEnum = z.enum(["cubic", "line"]);

export const ArrowheadEnum = z.enum([
  "arrow", "triangle", "square", "dot", "pipe", "diamond", "inverted", "bar", "none"
]);

/**
 * `elbow` routes with right angles (the mermaid/flowchart look); `arc` is a
 * curved freehand connector.
 */
export const ArrowKindEnum = z.enum(["arc", "elbow"]);

export const GeoKindEnum = z.enum([
  "rectangle", "ellipse", "triangle", "diamond", "pentagon", "hexagon",
  "octagon", "star", "rhombus", "rhombus-2", "oval", "trapezoid",
  "arrow-right", "arrow-left", "arrow-up", "arrow-down",
  "x-box", "check-box", "heart", "cloud"
]);

export const DirectionEnum = z.enum(["down", "up", "right", "left"]);

/**
 * Shape ids may be any friendly string ("login", "db"). The browser maps them
 * to tldraw's internal `shape:` namespace deterministically, so the same name
 * always refers to the same shape and arrows can reference nodes by name.
 */
const ShapeId = z.string().min(1).max(120);

const Base = z.object({
  id: ShapeId.optional().describe("Stable name for this shape; reference it from arrows and updates."),
  x: z.number().describe("Left edge in canvas px. +x is right."),
  y: z.number().describe("Top edge in canvas px. +y is down."),
  rotation: z.number().optional().describe("Radians, clockwise."),
  opacity: z.number().min(0).max(1).optional()
});

export const GeoShape = Base.extend({
  type: z.literal("geo"),
  w: z.number().positive().optional().describe("Width in px. Omit to auto-size to the text."),
  h: z.number().positive().optional().describe("Height in px. Omit to auto-size to the text."),
  geo: GeoKindEnum.default("rectangle"),
  text: z.string().optional().describe("Label drawn inside the shape."),
  color: ColorEnum.optional(),
  labelColor: ColorEnum.optional(),
  fill: FillEnum.optional(),
  dash: DashEnum.optional(),
  size: SizeEnum.optional().describe("Text and stroke size."),
  font: FontEnum.optional(),
  align: AlignEnum.optional().describe("Horizontal text alignment."),
  verticalAlign: VerticalAlignEnum.optional(),
  url: z.string().url().optional()
});

export const TextShape = Base.extend({
  type: z.literal("text"),
  text: z.string().min(1),
  color: ColorEnum.optional(),
  size: SizeEnum.optional(),
  font: FontEnum.optional(),
  textAlign: AlignEnum.optional(),
  w: z.number().positive().optional().describe("Fixed width; text wraps. Omit for a single auto-sized line.")
});

const Point = z.object({ x: z.number(), y: z.number() });

const ArrowBase = Base.extend({
  type: z.literal("arrow"),
  // Coordinates are optional because a bound arrow derives them from its
  // endpoints.
  x: z.number().optional(),
  y: z.number().optional(),
  start: Point.optional().describe("Absolute start point. Ignored when `from` is set."),
  end: Point.optional().describe("Absolute end point. Ignored when `to` is set."),
  from: ShapeId.optional().describe(
    "Id of the shape the arrow starts at. Binds the arrow so it follows that shape and anchors on its edge."
  ),
  to: ShapeId.optional().describe(
    "Id of the shape the arrow points at. Binds the arrow so it follows that shape and anchors on its edge."
  ),
  text: z.string().optional().describe("Label drawn on the arrow."),
  kind: ArrowKindEnum.optional().describe("`elbow` for right-angled flowchart connectors."),
  color: ColorEnum.optional(),
  labelColor: ColorEnum.optional(),
  dash: DashEnum.optional(),
  size: SizeEnum.optional(),
  font: FontEnum.optional(),
  bend: z.number().optional().describe("Curve amount in px; 0 is straight. Only applies to `arc`."),
  arrowheadStart: ArrowheadEnum.optional().describe("Default `none`."),
  arrowheadEnd: ArrowheadEnum.optional().describe("Default `arrow`.")
});

export const ArrowShape = ArrowBase.refine(
  (a) => a.from !== undefined || a.start !== undefined || (a.x !== undefined && a.y !== undefined),
  { message: "Arrow needs either `from` (a shape id) or a start position (`start`, or `x`+`y`)." }
).refine(
  (a) => a.to !== undefined || a.end !== undefined,
  { message: "Arrow needs either `to` (a shape id) or an `end` point." }
);

const LineBase = Base.extend({
  type: z.literal("line"),
  end: Point.optional().describe("Absolute end point, for a simple two-point line."),
  points: z.array(Point).min(2).optional().describe("Absolute points for a multi-segment line."),
  color: ColorEnum.optional(),
  dash: DashEnum.optional(),
  size: SizeEnum.optional(),
  spline: SplineEnum.optional().describe("`cubic` smooths the line through its points.")
});

export const LineShape = LineBase.refine(
  (l) => l.end !== undefined || (l.points?.length ?? 0) >= 2,
  { message: "Line needs either `end` or at least two `points`." }
);

export const DrawShape = Base.extend({
  type: z.literal("draw"),
  points: z.array(Point).min(2).describe("Absolute points of the freehand stroke."),
  color: ColorEnum.optional(),
  fill: FillEnum.optional(),
  dash: DashEnum.optional(),
  size: SizeEnum.optional(),
  closed: z.boolean().optional().describe("Join the last point back to the first.")
});

export const NoteShape = Base.extend({
  type: z.literal("note"),
  text: z.string(),
  color: ColorEnum.optional(),
  labelColor: ColorEnum.optional(),
  size: SizeEnum.optional(),
  font: FontEnum.optional(),
  align: AlignEnum.optional(),
  verticalAlign: VerticalAlignEnum.optional()
});

/** A titled container. Useful for grouping phases, swimlanes or subsystems. */
export const FrameShape = Base.extend({
  type: z.literal("frame"),
  w: z.number().positive(),
  h: z.number().positive(),
  name: z.string().optional().describe("Title shown on the frame's tab."),
  color: ColorEnum.optional()
});

// `refine` produces a ZodEffects, which `discriminatedUnion` cannot introspect,
// so the union is built from the plain object schemas and the cross-field rules
// for arrow/line are applied by `parseShape` below.
export const Shape = z.discriminatedUnion("type", [
  GeoShape, TextShape, DrawShape, NoteShape, FrameShape, ArrowBase, LineBase
]);

export type Shape = z.infer<typeof Shape>;

/**
 * Validate a shape including the arrow/line cross-field rules.
 * Always use this instead of `Shape.parse` directly.
 */
export function parseShape(input: unknown): Shape {
  const base = Shape.parse(input);
  if (base.type === "arrow") return ArrowShape.parse(input) as Shape;
  if (base.type === "line") return LineShape.parse(input) as Shape;
  return base;
}

export const ShapeUpdate = z.object({
  id: ShapeId,
  props: z.record(z.unknown()).describe(
    "Fields to change, using the same names as create_shape (e.g. { color: 'red', text: 'Retry', x: 200 }). Geometry and styles are both accepted."
  )
});
export type ShapeUpdate = z.infer<typeof ShapeUpdate>;

export const MAX_SHAPES_PER_CALL = 300;
