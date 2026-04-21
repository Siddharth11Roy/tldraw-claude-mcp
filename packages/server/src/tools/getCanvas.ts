import { randomUUID } from "node:crypto";
import { Bridge, NoBrowserError } from "../bridge.js";
import type { Shape } from "../shapes.js";

export interface GetCanvasResult {
  shapes: Shape[];
}

export async function getCanvas(bridge: Bridge): Promise<GetCanvasResult> {
  if (!bridge.isConnected()) throw new NoBrowserError();
  const reply = await bridge.send({ op: "query", msgId: randomUUID() });
  if (reply.op !== "state") {
    const message = reply.op === "ack" && !reply.ok ? reply.message : "Expected canvas state, got something else.";
    throw new Error(message);
  }
  return { shapes: reply.shapes };
}
