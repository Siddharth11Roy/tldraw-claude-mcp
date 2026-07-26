import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  ColorEnum, FillEnum, DashEnum, SizeEnum, FontEnum,
  GeoKindEnum, DirectionEnum, ArrowKindEnum, ArrowheadEnum,
  type Shape
} from "../shapes.js";
import { Bridge, NoBrowserError, expectAck } from "../bridge.js";
import { layoutGraph, type LayoutNode, type LayoutEdge } from "../layout.js";
import { measureNodeSize, applyShapeFactor } from "../textMetrics.js";

/**
 * Semantic roles, so the caller describes *meaning* and gets conventional
 * flowchart styling for free. Picking a geo kind and a palette by hand is where
 * hand-built diagrams usually go wrong.
 */
export const RoleEnum = z.enum([
  "process", "start", "end", "decision", "io",
  "data", "external", "error", "success", "note"
]);
export type Role = z.infer<typeof RoleEnum>;

interface RoleStyle {
  geo: string;
  color: string;
  fill: string;
  note?: boolean;
}

// `x-box` and `check-box` deliberately are not used here: tldraw draws their
// mark across the whole shape, straight through any label. Colour carries the
// same meaning without wrecking the text.
const ROLE_STYLES: Record<Role, RoleStyle> = {
  process:  { geo: "rectangle", color: "blue",         fill: "semi" },
  start:    { geo: "oval",      color: "green",        fill: "semi" },
  end:      { geo: "oval",      color: "light-red",    fill: "semi" },
  decision: { geo: "diamond",   color: "yellow",       fill: "semi" },
  io:       { geo: "rhombus",   color: "light-violet", fill: "semi" },
  data:     { geo: "trapezoid", color: "light-blue",   fill: "semi" },
  external: { geo: "cloud",     color: "grey",         fill: "semi" },
  error:    { geo: "rectangle", color: "red",          fill: "semi" },
  success:  { geo: "rectangle", color: "green",        fill: "semi" },
  note:     { geo: "rectangle", color: "yellow",       fill: "semi", note: true }
};

const DiagramNode = z.object({
  id: z.string().min(1).describe("Unique key; edges reference it."),
  label: z.string().default("").describe("Text shown inside the node."),
  role: RoleEnum.optional().describe(
    "Semantic role; sets shape and colour conventionally. Defaults to `process`."
  ),
  shape: GeoKindEnum.optional().describe("Override the role's shape."),
  color: ColorEnum.optional().describe("Override the role's colour."),
  fill: FillEnum.optional(),
  size: SizeEnum.optional(),
  font: FontEnum.optional(),
  w: z.number().positive().optional().describe("Fixed width; otherwise sized to the label."),
  h: z.number().positive().optional().describe("Fixed height; otherwise sized to the label."),
  rank: z.number().int().min(0).optional().describe(
    "Pin this node to a specific layer instead of deriving one from the edges."
  )
});

const DiagramEdge = z.object({
  from: z.string().min(1).describe("Source node id."),
  to: z.string().min(1).describe("Target node id."),
  label: z.string().optional().describe("Text on the connector, e.g. \"yes\" / \"no\"."),
  dash: DashEnum.optional().describe("`dashed` reads well for optional or async paths."),
  color: ColorEnum.optional(),
  kind: ArrowKindEnum.optional().describe("Override the diagram-wide connector style."),
  arrowheadEnd: ArrowheadEnum.optional(),
  arrowheadStart: ArrowheadEnum.optional()
});

export const DiagramInput = z.object({
  nodes: z.array(DiagramNode).min(1).max(200),
  edges: z.array(DiagramEdge).max(400).default([]),
  direction: DirectionEnum.default("down").describe(
    "Flow direction. `down` = top-to-bottom (mermaid TD), `right` = left-to-right (mermaid LR)."
  ),
  connector: ArrowKindEnum.default("elbow").describe(
    "`elbow` gives right-angled flowchart connectors; `arc` gives curved ones."
  ),
  title: z.string().optional().describe("Heading drawn above the diagram."),
  origin: z.object({ x: z.number(), y: z.number() }).optional()
    .describe("Top-left corner of the diagram. Defaults to (100, 100)."),
  spacing: z.object({
    rank: z.number().positive().optional().describe("Gap between layers."),
    node: z.number().positive().optional().describe("Gap between siblings.")
  }).optional(),
  replace: z.boolean().default(false).describe(
    "Clear the canvas before drawing. Use when redrawing a diagram from scratch."
  )
});
export type DiagramInput = z.infer<typeof DiagramInput>;

export interface DiagramResult {
  created: number;
  nodes: number;
  edges: number;
  ids: string[];
  bounds: { x: number; y: number; w: number; h: number };
  /** Populated when edges close a cycle; those render as feedback loops. */
  backEdges: { from: string; to: string }[];
  warnings: string[];
}

export async function createDiagram(
  bridge: Bridge,
  input: DiagramInput
): Promise<DiagramResult> {
  if (!bridge.isConnected()) throw new NoBrowserError(bridge.canvasUrl());

  const warnings: string[] = [];
  const known = new Set(input.nodes.map((n) => n.id));

  const duplicates = input.nodes
    .map((n) => n.id)
    .filter((id, i, all) => all.indexOf(id) !== i);
  if (duplicates.length) {
    throw new Error(
      `Duplicate node ids: ${[...new Set(duplicates)].join(", ")}. Node ids must be unique.`
    );
  }

  const edges = input.edges.filter((e) => {
    if (!known.has(e.from) || !known.has(e.to)) {
      warnings.push(
        `Dropped edge ${e.from} -> ${e.to}: ${!known.has(e.from) ? e.from : e.to} is not a declared node.`
      );
      return false;
    }
    return true;
  });

  // --- size every node from its label ---
  const styleOf = (n: z.infer<typeof DiagramNode>) => {
    const role = ROLE_STYLES[n.role ?? "process"];
    return {
      geo: n.shape ?? role.geo,
      color: n.color ?? role.color,
      fill: n.fill ?? role.fill,
      isNote: role.note === true && n.shape === undefined
    };
  };

  const layoutNodes: LayoutNode[] = input.nodes.map((n) => {
    const style = styleOf(n);
    // Sticky notes are a fixed size in tldraw; everything else grows to fit.
    if (style.isNote) {
      return { id: n.id, w: n.w ?? 200, h: n.h ?? 200, rank: n.rank };
    }
    const base = measureNodeSize(n.label, { size: n.size ?? "m", font: n.font ?? "draw" });
    const fitted = applyShapeFactor(style.geo, base);
    return {
      id: n.id,
      w: n.w ?? fitted.w,
      h: n.h ?? fitted.h,
      rank: n.rank
    };
  });

  // Labelled connectors need room to sit between layers without colliding.
  const hasEdgeLabels = edges.some((e) => e.label);
  const rankGap = input.spacing?.rank ?? (hasEdgeLabels ? 130 : 90);
  const nodeGap = input.spacing?.node ?? 60;

  const layoutEdges: LayoutEdge[] = edges.map((e) => ({ from: e.from, to: e.to }));
  const result = layoutGraph(layoutNodes, layoutEdges, {
    direction: input.direction,
    rankGap,
    nodeGap,
    origin: input.origin ?? { x: 100, y: 100 }
  });

  // --- emit shapes ---
  const shapes: Shape[] = [];
  const prefix = idPrefix(input);

  if (input.title) {
    shapes.push({
      type: "text",
      id: `${prefix}title`,
      text: input.title,
      x: result.bounds.x,
      y: result.bounds.y - 80,
      size: "l",
      color: "black"
    } as Shape);
  }

  for (const n of input.nodes) {
    const placed = result.nodes.get(n.id)!;
    const style = styleOf(n);

    if (style.isNote) {
      shapes.push({
        type: "note",
        id: n.id,
        x: placed.x,
        y: placed.y,
        text: n.label,
        color: style.color,
        size: n.size,
        font: n.font
      } as Shape);
      continue;
    }

    shapes.push({
      type: "geo",
      id: n.id,
      x: placed.x,
      y: placed.y,
      w: placed.w,
      h: placed.h,
      geo: style.geo,
      text: n.label,
      color: style.color,
      fill: style.fill,
      size: n.size ?? "m",
      font: n.font,
      align: "middle",
      verticalAlign: "middle"
    } as Shape);
  }

  // Arrows carry `from`/`to`, so the browser binds them to the node shapes.
  // A bound arrow anchors on the node's edge and follows it when it moves —
  // this is what makes the links look drawn rather than approximated.
  //
  // Feedback loops need different treatment. An elbow connector running against
  // the flow takes the shortest path, which is straight back through the nodes
  // in between — tldraw's elbow routing does no obstacle avoidance. Bowing them
  // out past the edge of the diagram keeps the forward path readable.
  const isBackEdge = new Set(result.backEdges.map((e) => `${e.from} ${e.to}`));
  const vertical = input.direction === "down" || input.direction === "up";
  const halfCross = (vertical ? result.bounds.w : result.bounds.h) / 2;
  let loopIndex = 0;

  edges.forEach((e, i) => {
    const back = isBackEdge.has(`${e.from} ${e.to}`);
    // An explicit `kind` from the caller always wins.
    const kind = e.kind ?? (back ? "arc" : input.connector);
    const bend =
      back && e.kind === undefined ? halfCross + 70 + loopIndex++ * 45 : undefined;

    shapes.push({
      type: "arrow",
      id: `${prefix}edge-${i}`,
      from: e.from,
      to: e.to,
      text: e.label,
      kind,
      bend,
      color: e.color ?? "black",
      dash: e.dash,
      arrowheadStart: e.arrowheadStart ?? "none",
      arrowheadEnd: e.arrowheadEnd ?? "arrow",
      size: "s"
    } as Shape);
  });

  if (input.replace) {
    const cleared = await bridge.send({ op: "clear", msgId: randomUUID() });
    expectAck(cleared);
  }

  const reply = await bridge.send({ op: "create", msgId: randomUUID(), shapes });
  const { ids } = expectAck(reply);

  // Bring the new diagram into view; failure here is cosmetic, not fatal.
  try {
    await bridge.send({ op: "fit", msgId: randomUUID() });
  } catch {
    /* ignore */
  }

  return {
    created: shapes.length,
    nodes: input.nodes.length,
    edges: edges.length,
    ids,
    bounds: result.bounds,
    backEdges: result.backEdges.map((e) => ({ from: e.from, to: e.to })),
    warnings
  };
}

/** Keep generated ids from colliding with a caller's node names. */
function idPrefix(input: DiagramInput): string {
  const taken = new Set(input.nodes.map((n) => n.id));
  let prefix = "d-";
  let i = 0;
  while ([...taken].some((id) => id.startsWith(prefix))) prefix = `d${i++}-`;
  return prefix;
}
