import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ShapeUpdate, MAX_SHAPES_PER_CALL } from "../shapes.js";
import { Bridge, NoBrowserError } from "../bridge.js";

export const UpdateInput = z.object({
  updates: z.array(ShapeUpdate).min(1).max(MAX_SHAPES_PER_CALL)
});
export type UpdateInput = z.infer<typeof UpdateInput>;

export interface UpdateResult {
  updated: number;
}

export async function updateShape(bridge: Bridge, input: UpdateInput): Promise<UpdateResult> {
  if (!bridge.isConnected()) throw new NoBrowserError();
  const reply = await bridge.send({ op: "update", msgId: randomUUID(), updates: input.updates });
  if (reply.op !== "ack" || !reply.ok) {
    const message = reply.op === "ack" ? reply.message : "Unexpected reply from browser.";
    throw new Error(message);
  }
  return { updated: input.updates.length };
}
