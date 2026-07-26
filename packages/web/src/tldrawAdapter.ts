// Translates the bridge protocol into tldraw editor calls.
// Kept separate from BridgeClient so the WS layer stays pure transport.

import type { Editor, TLShapeId, TLShapePartial, TLBindingId, IndexKey } from "tldraw";
import { createShapeId, createBindingId, toRichText, getIndices } from "tldraw";

// ---------------------------------------------------------------------------
// ids
// ---------------------------------------------------------------------------

/**
 * Callers use friendly names ("login", "db"). tldraw namespaces shape ids with
 * a `shape:` prefix. Mapping is deterministic in both directions so the same
 * name always refers to the same shape across calls — which is what lets an
 * arrow reference a node by name and lets a redraw update in place.
 */
export function toShapeId(name: string): TLShapeId {
  return (name.startsWith("shape:") ? name : `shape:${name}`) as TLShapeId;
}

export function toFriendlyId(id: string): string {
  return id.startsWith("shape:") ? id.slice(6) : id;
}

// ---------------------------------------------------------------------------
// rich text
// ---------------------------------------------------------------------------

/** Pull plain text back out of a ProseMirror document, for get_canvas. */
function plainTextFrom(rich: unknown): string | undefined {
  if (!rich || typeof rich !== "object") return undefined;
  const parts: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.text === "string") parts.push(node.text);
    if (Array.isArray(node.content)) {
      node.content.forEach((child: any, i: number) => {
        walk(child);
        // Paragraph siblings are separate lines.
        if (node.type === "doc" && i < node.content.length - 1) parts.push("\n");
      });
    }
  };
  walk(rich);
  const text = parts.join("");
  return text.length ? text : undefined;
}

// ---------------------------------------------------------------------------
// input types (mirrors packages/server/src/shapes.ts)
// ---------------------------------------------------------------------------

interface Pt { x: number; y: number }

interface InputShape {
  id?: string;
  type: string;
  x?: number;
  y?: number;
  rotation?: number;
  opacity?: number;
  w?: number;
  h?: number;
  text?: string;
  name?: string;
  color?: string;
  labelColor?: string;
  fill?: string;
  dash?: string;
  size?: string;
  font?: string;
  align?: string;
  verticalAlign?: string;
  textAlign?: string;
  geo?: string;
  url?: string;
  spline?: string;
  closed?: boolean;
  kind?: string;
  bend?: number;
  arrowheadStart?: string;
  arrowheadEnd?: string;
  start?: Pt;
  end?: Pt;
  from?: string;
  to?: string;
  points?: Pt[];
}

interface ConnectionInput {
  id?: string;
  from: string;
  to: string;
  text?: string;
  kind?: string;
  color?: string;
  labelColor?: string;
  dash?: string;
  size?: string;
  font?: string;
  bend?: number;
  arrowheadStart?: string;
  arrowheadEnd?: string;
}

function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

export function makeAdapter(editor: Editor) {
  /** Centre of a shape in page space, for positioning bound arrows. */
  const centreOf = (id: TLShapeId): Pt | null => {
    const bounds = editor.getShapePageBounds(id);
    return bounds ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 } : null;
  };

  /**
   * Build an arrow partial plus the bindings it needs. Bound terminals are what
   * make connectors anchor on a shape's edge and re-route when it moves; an
   * arrow drawn from raw coordinates just overlaps whatever is in the way.
   */
  const buildArrow = (
    id: TLShapeId,
    raw: InputShape | ConnectionInput,
    resolve: (name: string) => TLShapeId
  ): { partial: TLShapePartial; bindings: any[]; error?: string } => {
    const a = raw as InputShape;
    const fromId = a.from ? resolve(a.from) : null;
    const toId = a.to ? resolve(a.to) : null;

    if (a.from && !editor.getShape(fromId!)) {
      return { partial: null as any, bindings: [], error: `no shape named "${a.from}"` };
    }
    if (a.to && !editor.getShape(toId!)) {
      return { partial: null as any, bindings: [], error: `no shape named "${a.to}"` };
    }

    // Resolve concrete page-space endpoints. Bound terminals are recomputed by
    // tldraw, but the shape still needs valid geometry on creation.
    const startPt: Pt =
      (fromId && centreOf(fromId)) ??
      a.start ??
      (a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : { x: 0, y: 0 });
    const endPt: Pt =
      (toId && centreOf(toId)) ?? a.end ?? { x: startPt.x + 100, y: startPt.y };

    const partial: TLShapePartial = {
      id,
      type: "arrow",
      x: startPt.x,
      y: startPt.y,
      rotation: a.rotation,
      opacity: a.opacity,
      props: clean({
        start: { x: 0, y: 0 },
        end: { x: endPt.x - startPt.x, y: endPt.y - startPt.y },
        kind: a.kind,
        color: a.color,
        labelColor: a.labelColor,
        dash: a.dash,
        size: a.size,
        font: a.font,
        bend: a.bend,
        arrowheadStart: a.arrowheadStart,
        arrowheadEnd: a.arrowheadEnd,
        // Arrow labels are a plain string, not rich text — unlike every other
        // labelled shape in tldraw.
        text: a.text
      }) as any
    } as TLShapePartial;

    const bindings: any[] = [];
    const bind = (terminal: "start" | "end", target: TLShapeId) => ({
      id: createBindingId(),
      type: "arrow",
      fromId: id,
      toId: target,
      props: {
        terminal,
        // Centre anchor + isPrecise:false lets tldraw pick the edge crossing,
        // which is what produces clean flowchart connectors.
        normalizedAnchor: { x: 0.5, y: 0.5 },
        isExact: false,
        isPrecise: false,
        snap: "none"
      }
    });
    if (fromId) bindings.push(bind("start", fromId));
    if (toId) bindings.push(bind("end", toId));

    return { partial, bindings };
  };

  const toPartial = (id: TLShapeId, raw: InputShape): TLShapePartial => {
    const x = raw.x ?? 0;
    const y = raw.y ?? 0;
    const common = { id, x, y, rotation: raw.rotation, opacity: raw.opacity };

    switch (raw.type) {
      case "geo":
        return {
          ...common,
          type: "geo",
          props: clean({
            geo: raw.geo ?? "rectangle",
            w: raw.w ?? 160,
            h: raw.h ?? 80,
            color: raw.color,
            labelColor: raw.labelColor,
            fill: raw.fill,
            dash: raw.dash,
            size: raw.size,
            font: raw.font,
            align: raw.align,
            verticalAlign: raw.verticalAlign,
            url: raw.url,
            richText: raw.text !== undefined ? toRichText(raw.text) : undefined
          }) as any
        } as TLShapePartial;

      case "text":
        return {
          ...common,
          type: "text",
          props: clean({
            richText: toRichText(raw.text ?? ""),
            color: raw.color,
            size: raw.size,
            font: raw.font,
            textAlign: raw.textAlign,
            // A fixed width means the text wraps instead of running on forever.
            ...(raw.w !== undefined ? { w: raw.w, autoSize: false } : {})
          }) as any
        } as TLShapePartial;

      case "line": {
        const abs = raw.points ?? [{ x, y }, raw.end ?? { x: x + 100, y }];
        const indices = getIndices(abs.length);
        return {
          ...common,
          type: "line",
          props: clean({
            color: raw.color,
            dash: raw.dash,
            size: raw.size,
            spline: raw.spline,
            // Points are shape-local and keyed by their own fractional index.
            points: Object.fromEntries(
              abs.map((p, i) => {
                const key = indices[i] as IndexKey;
                return [key, { id: key, index: key, x: p.x - x, y: p.y - y }];
              })
            )
          }) as any
        } as TLShapePartial;
      }

      case "draw":
        return {
          ...common,
          type: "draw",
          props: clean({
            segments: [
              {
                type: "free",
                // z is the pressure channel; tldraw infers pen vs mouse from it.
                points: (raw.points ?? []).map((p) => ({ x: p.x - x, y: p.y - y, z: 0.5 }))
              }
            ],
            color: raw.color,
            fill: raw.fill,
            dash: raw.dash,
            size: raw.size,
            isClosed: raw.closed,
            // Without this the stroke renders as an in-progress scribble.
            isComplete: true
          }) as any
        } as TLShapePartial;

      case "note":
        return {
          ...common,
          type: "note",
          props: clean({
            richText: toRichText(raw.text ?? ""),
            color: raw.color,
            labelColor: raw.labelColor,
            size: raw.size,
            font: raw.font,
            align: raw.align,
            verticalAlign: raw.verticalAlign
          }) as any
        } as TLShapePartial;

      case "frame":
        return {
          ...common,
          type: "frame",
          props: clean({
            w: raw.w ?? 400,
            h: raw.h ?? 300,
            name: raw.name ?? raw.text,
            color: raw.color
          }) as any
        } as TLShapePartial;

      default:
        throw new Error(`Unknown shape type: ${raw.type}`);
    }
  };

  return {
    create(shapes: unknown[]): string[] {
      const input = shapes as InputShape[];

      // Names declared in this batch resolve to their own shapes; anything else
      // is looked up on the canvas.
      const resolve = (name: string) => toShapeId(name);

      const ids: TLShapeId[] = [];
      const plain: InputShape[] = [];
      const arrows: InputShape[] = [];
      for (const raw of input) {
        (raw.type === "arrow" ? arrows : plain).push(raw);
      }

      const assignId = (raw: InputShape) => (raw.id ? toShapeId(raw.id) : createShapeId());

      // Re-running a diagram should refine it, not fail on duplicate ids, so
      // anything already present is updated in place.
      const toCreate: TLShapePartial[] = [];
      const toUpdate: TLShapePartial[] = [];
      for (const raw of plain) {
        const id = assignId(raw);
        ids.push(id);
        const partial = toPartial(id, raw);
        (editor.getShape(id) ? toUpdate : toCreate).push(partial);
      }

      editor.run(() => {
        if (toCreate.length) editor.createShapes(toCreate);
        if (toUpdate.length) editor.updateShapes(toUpdate);

        // Arrows come second: their bindings need the endpoints to exist.
        const arrowPartials: TLShapePartial[] = [];
        const arrowUpdates: TLShapePartial[] = [];
        const bindings: any[] = [];
        const failures: string[] = [];

        for (const raw of arrows) {
          const id = assignId(raw);
          const built = buildArrow(id, raw, resolve);
          if (built.error) {
            failures.push(`arrow ${raw.id ?? "(unnamed)"}: ${built.error}`);
            continue;
          }
          ids.push(id);
          if (editor.getShape(id)) {
            // Drop stale bindings before rebinding, or the arrow keeps both.
            const existing = editor.getBindingsFromShape(id, "arrow");
            if (existing.length) editor.deleteBindings(existing.map((b) => b.id as TLBindingId));
            arrowUpdates.push(built.partial);
          } else {
            arrowPartials.push(built.partial);
          }
          bindings.push(...built.bindings);
        }

        if (arrowPartials.length) editor.createShapes(arrowPartials);
        if (arrowUpdates.length) editor.updateShapes(arrowUpdates);
        if (bindings.length) editor.createBindings(bindings);

        if (failures.length) {
          throw new Error(
            `Could not link ${failures.length} arrow(s): ${failures.join("; ")}. ` +
              `Create the target shapes first, or call get_canvas to check their ids.`
          );
        }
      });

      return ids.map(toFriendlyId);
    },

    connect(connections: unknown[]): { ids: string[]; missing: string[] } {
      const input = connections as ConnectionInput[];
      const ids: string[] = [];
      const missing: string[] = [];

      editor.run(() => {
        const partials: TLShapePartial[] = [];
        const bindings: any[] = [];
        for (const c of input) {
          const id = c.id ? toShapeId(c.id) : createShapeId();
          const built = buildArrow(id, c, toShapeId);
          if (built.error) {
            missing.push(`${c.from} -> ${c.to} (${built.error})`);
            continue;
          }
          partials.push(built.partial);
          bindings.push(...built.bindings);
          ids.push(toFriendlyId(id));
        }
        if (partials.length) editor.createShapes(partials);
        if (bindings.length) editor.createBindings(bindings);
      });

      return { ids, missing };
    },

    update(updates: { id: string; props: Record<string, unknown> }[]): {
      updated: number;
      missing: string[];
    } {
      const missing: string[] = [];
      const partials: TLShapePartial[] = [];

      for (const u of updates) {
        const id = toShapeId(u.id);
        const shape = editor.getShape(id);
        if (!shape) {
          missing.push(u.id);
          continue;
        }

        // Callers pass a flat bag of fields. Geometry lives on the shape record
        // while everything else lives under `props` — routing them correctly is
        // why a plain spread silently did nothing before.
        const top: Record<string, unknown> = {};
        const props: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(u.props)) {
          if (v === undefined) continue;
          if (k === "x" || k === "y" || k === "rotation" || k === "opacity" || k === "isLocked") {
            top[k] = v;
          } else if (k === "text") {
            // Arrows keep a plain string; every other labelled shape uses rich text.
            props[k === "text" && shape.type === "arrow" ? "text" : "richText"] =
              shape.type === "arrow" ? String(v) : toRichText(String(v));
          } else if (k === "name" && shape.type === "frame") {
            props.name = v;
          } else {
            props[k] = v;
          }
        }

        partials.push({ id, type: shape.type, ...top, props } as TLShapePartial);
      }

      if (partials.length) editor.updateShapes(partials);
      return { updated: partials.length, missing };
    },

    remove(ids: string[]): number {
      const shapeIds = ids.map(toShapeId).filter((id) => editor.getShape(id));
      if (shapeIds.length) editor.deleteShapes(shapeIds);
      return shapeIds.length;
    },

    clear(): number {
      const all = editor.getCurrentPageShapes().map((s) => s.id);
      if (all.length) editor.deleteShapes(all);
      return all.length;
    },

    fit(): void {
      editor.zoomToFit({ animation: { duration: 200 } });
    },

    snapshot(): { shapes: unknown[]; bounds?: { x: number; y: number; w: number; h: number } } {
      const shapes = editor.getCurrentPageShapes().map((s) => {
        const props = s.props as Record<string, unknown>;
        const bounds = editor.getShapePageBounds(s.id);

        // Resolve arrow bindings back to friendly ids so a follow-up edit can
        // see how things are actually wired together.
        let from: string | undefined;
        let to: string | undefined;
        if (s.type === "arrow") {
          for (const b of editor.getBindingsFromShape(s.id, "arrow")) {
            const terminal = (b.props as { terminal?: string }).terminal;
            if (terminal === "start") from = toFriendlyId(b.toId);
            if (terminal === "end") to = toFriendlyId(b.toId);
          }
        }

        const text =
          typeof props.text === "string" && props.text
            ? props.text
            : plainTextFrom(props.richText);

        return clean({
          id: toFriendlyId(s.id),
          type: s.type,
          x: Math.round(s.x),
          y: Math.round(s.y),
          w: bounds ? Math.round(bounds.w) : undefined,
          h: bounds ? Math.round(bounds.h) : undefined,
          rotation: s.rotation || undefined,
          text,
          from,
          to,
          geo: props.geo,
          color: props.color
        });
      });

      const pageBounds = editor.getCurrentPageBounds();
      return {
        shapes,
        bounds: pageBounds
          ? {
              x: Math.round(pageBounds.x),
              y: Math.round(pageBounds.y),
              w: Math.round(pageBounds.w),
              h: Math.round(pageBounds.h)
            }
          : undefined
      };
    }
  };
}
