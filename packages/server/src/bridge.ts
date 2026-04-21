import type { Shape, ShapeUpdate } from "./shapes.js";

export type BridgeOp =
  | { op: "create"; msgId: string; shapes: Shape[] }
  | { op: "update"; msgId: string; updates: ShapeUpdate[] }
  | { op: "delete"; msgId: string; ids: string[] }
  | { op: "query"; msgId: string };

export type BridgeReply =
  | { op: "ack"; msgId: string; ok: true; ids?: string[] }
  | { op: "ack"; msgId: string; ok: false; message: string }
  | { op: "state"; msgId: string; shapes: Shape[] };

export interface Bridge {
  isConnected(): boolean;
  send(op: BridgeOp): Promise<BridgeReply>;
}

export class NoBrowserError extends Error {
  constructor() {
    super("No tldraw browser connected. Open http://localhost:3030 to start drawing.");
    this.name = "NoBrowserError";
  }
}

export class BridgeTimeoutError extends Error {
  constructor(ms: number) {
    super(`Bridge timed out after ${ms}ms waiting for the browser to respond.`);
    this.name = "BridgeTimeoutError";
  }
}
