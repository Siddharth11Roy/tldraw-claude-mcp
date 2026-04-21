// Translates the bridge protocol shapes into tldraw editor calls.
// Kept separate from BridgeClient so the WS layer stays pure transport.

import type { Editor, TLShapeId, TLShapePartial } from "tldraw";
import { createShapeId, toRichText } from "tldraw";

function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

interface InputShape {
  id?: string;
  type: string;
  x: number;
  y: number;
  rotation?: number;
  w?: number;
  h?: number;
  text?: string;
  color?: string;
  fill?: string;
  geo?: string;
  end?: { x: number; y: number };
  points?: { x: number; y: number }[];
  size?: string;
}

export function makeAdapter(editor: Editor) {
  return {
    create(shapes: unknown[]): string[] {
      const ids: TLShapeId[] = [];
      const partials: TLShapePartial[] = [];
      for (const raw of shapes as InputShape[]) {
        const id = (raw.id ? raw.id as TLShapeId : createShapeId());
        ids.push(id);
        partials.push(toPartial(id, raw));
      }
      editor.createShapes(partials);
      return ids;
    },
    update(updates: { id: string; props: Record<string, unknown> }[]) {
      const partials: TLShapePartial[] = updates.map((u) => ({
        id: u.id as TLShapeId,
        type: editor.getShape(u.id as TLShapeId)?.type ?? "geo",
        ...(u.props as object)
      })) as TLShapePartial[];
      editor.updateShapes(partials);
    },
    remove(ids: string[]) {
      editor.deleteShapes(ids as TLShapeId[]);
    },
    snapshot(): unknown[] {
      return editor.getCurrentPageShapes().map((s) => ({
        id: s.id, type: s.type, x: s.x, y: s.y, rotation: s.rotation, props: s.props
      }));
    }
  };
}

function toPartial(id: TLShapeId, raw: InputShape): TLShapePartial {
  switch (raw.type) {
    case "geo":
      return {
        id, type: "geo", x: raw.x, y: raw.y, rotation: raw.rotation,
        props: clean({
          geo: raw.geo ?? "rectangle",
          w: raw.w ?? 100, h: raw.h ?? 100,
          color: raw.color, fill: raw.fill,
          richText: raw.text ? toRichText(raw.text) : undefined
        }) as any
      } as TLShapePartial;
    case "text":
      return {
        id, type: "text", x: raw.x, y: raw.y,
        props: clean({
          richText: toRichText(raw.text ?? ""),
          color: raw.color, size: raw.size
        }) as any
      } as TLShapePartial;
    case "arrow":
      return {
        id, type: "arrow", x: raw.x, y: raw.y,
        props: clean({
          start: { x: 0, y: 0 },
          end: { x: (raw.end?.x ?? raw.x) - raw.x, y: (raw.end?.y ?? raw.y) - raw.y },
          color: raw.color,
          richText: raw.text ? toRichText(raw.text) : undefined
        }) as any
      } as TLShapePartial;
    case "line":
      return {
        id, type: "line", x: raw.x, y: raw.y,
        props: clean({ color: raw.color }) as any
      } as TLShapePartial;
    case "draw":
      return {
        id, type: "draw", x: raw.x, y: raw.y,
        props: clean({
          segments: [{ type: "free", points: raw.points ?? [] }],
          color: raw.color
        }) as any
      } as TLShapePartial;
    case "note":
      return {
        id, type: "note", x: raw.x, y: raw.y,
        props: clean({
          richText: toRichText(raw.text ?? ""),
          color: raw.color
        }) as any
      } as TLShapePartial;
    default:
      throw new Error(`Unknown shape type: ${raw.type}`);
  }
}
