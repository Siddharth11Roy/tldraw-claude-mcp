import { z } from "zod";

export const ColorEnum = z.enum([
  "black", "grey", "light-violet", "violet", "blue",
  "light-blue", "yellow", "orange", "green", "light-green", "red"
]);

export const FillEnum = z.enum(["none", "semi", "solid", "pattern"]);

export const GeoKindEnum = z.enum([
  "rectangle", "ellipse", "triangle", "diamond", "star",
  "pentagon", "hexagon", "octagon", "rhombus", "oval", "trapezoid", "arrow-right", "arrow-left", "arrow-up", "arrow-down", "x-box", "check-box", "heart", "cloud"
]);

const Base = z.object({
  id: z.string().optional(),
  x: z.number(),
  y: z.number(),
  rotation: z.number().optional()
});

export const GeoShape = Base.extend({
  type: z.literal("geo"),
  w: z.number().positive(),
  h: z.number().positive(),
  geo: GeoKindEnum.default("rectangle"),
  color: ColorEnum.optional(),
  fill: FillEnum.optional(),
  text: z.string().optional()
});

export const TextShape = Base.extend({
  type: z.literal("text"),
  text: z.string(),
  color: ColorEnum.optional(),
  size: z.enum(["s", "m", "l", "xl"]).optional()
});

export const ArrowShape = Base.extend({
  type: z.literal("arrow"),
  end: z.object({ x: z.number(), y: z.number() }),
  color: ColorEnum.optional(),
  text: z.string().optional()
});

export const LineShape = Base.extend({
  type: z.literal("line"),
  end: z.object({ x: z.number(), y: z.number() }),
  color: ColorEnum.optional()
});

export const DrawShape = Base.extend({
  type: z.literal("draw"),
  points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
  color: ColorEnum.optional()
});

export const NoteShape = Base.extend({
  type: z.literal("note"),
  text: z.string(),
  color: ColorEnum.optional()
});

export const Shape = z.discriminatedUnion("type", [
  GeoShape, TextShape, ArrowShape, LineShape, DrawShape, NoteShape
]);

export type Shape = z.infer<typeof Shape>;

export const ShapeUpdate = z.object({
  id: z.string().min(1),
  props: z.record(z.unknown())
});
export type ShapeUpdate = z.infer<typeof ShapeUpdate>;

export const MAX_SHAPES_PER_CALL = 200;
