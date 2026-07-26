import type { Shape, ShapeUpdate } from "./shapes.js";

/** A connector to create between two shapes that already exist on the canvas. */
export interface Connection {
  id?: string;
  from: string;
  to: string;
  text?: string;
  kind?: "arc" | "elbow";
  color?: string;
  labelColor?: string;
  dash?: string;
  size?: string;
  font?: string;
  bend?: number;
  arrowheadStart?: string;
  arrowheadEnd?: string;
}

export type BridgeOp =
  | { op: "create"; msgId: string; shapes: Shape[] }
  | { op: "connect"; msgId: string; connections: Connection[] }
  | { op: "update"; msgId: string; updates: ShapeUpdate[] }
  | { op: "delete"; msgId: string; ids: string[] }
  | { op: "clear"; msgId: string }
  | { op: "fit"; msgId: string }
  | { op: "query"; msgId: string };

/** A shape as reported back from the browser. */
export interface CanvasShape {
  id: string;
  type: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  text?: string;
  /** For arrows: the ids of the shapes each terminal is bound to, if any. */
  from?: string;
  to?: string;
  props?: Record<string, unknown>;
}

export type BridgeReply =
  | { op: "ack"; msgId: string; ok: true; ids?: string[]; count?: number; missing?: string[] }
  | { op: "ack"; msgId: string; ok: false; message: string }
  | { op: "state"; msgId: string; shapes: CanvasShape[]; bounds?: Bounds };

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bridge {
  isConnected(): boolean;
  send(op: BridgeOp): Promise<BridgeReply>;
  /** URL the user should open to see the canvas. */
  canvasUrl(): string;
}

export class NoBrowserError extends Error {
  constructor(url = "http://localhost:3030") {
    super(
      `No tldraw canvas is open. Ask the user to open ${url} in a browser, then retry.`
    );
    this.name = "NoBrowserError";
  }
}

export class BridgeTimeoutError extends Error {
  constructor(ms: number) {
    super(`Bridge timed out after ${ms}ms waiting for the browser to respond.`);
    this.name = "BridgeTimeoutError";
  }
}

/** Shared unwrapping for ops that expect a simple ack. */
export function expectAck(
  reply: BridgeReply
): { ids: string[]; count: number; missing: string[] } {
  if (reply.op !== "ack") {
    throw new Error("Expected an acknowledgement from the browser, got canvas state.");
  }
  if (!reply.ok) throw new Error(reply.message);
  return {
    ids: reply.ids ?? [],
    count: reply.count ?? reply.ids?.length ?? 0,
    missing: reply.missing ?? []
  };
}
