import { randomUUID } from "node:crypto";
import { Bridge, NoBrowserError, type CanvasShape, type Bounds } from "../bridge.js";

export interface GetCanvasResult {
  count: number;
  shapes: CanvasShape[];
  bounds?: Bounds;
}

/**
 * Report what is on the canvas. Shapes come back with their resolved geometry
 * and, for arrows, the ids they are bound to — so a follow-up edit can reason
 * about the existing structure instead of guessing.
 */
export async function getCanvas(bridge: Bridge): Promise<GetCanvasResult> {
  if (!bridge.isConnected()) throw new NoBrowserError(bridge.canvasUrl());
  const reply = await bridge.send({ op: "query", msgId: randomUUID() });
  if (reply.op !== "state") {
    const message =
      reply.op === "ack" && !reply.ok ? reply.message : "Expected canvas state, got something else.";
    throw new Error(message);
  }
  return { count: reply.shapes.length, shapes: reply.shapes, bounds: reply.bounds };
}
