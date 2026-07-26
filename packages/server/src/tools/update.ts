import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ShapeUpdate, MAX_SHAPES_PER_CALL } from "../shapes.js";
import { Bridge, NoBrowserError, expectAck } from "../bridge.js";

export const UpdateInput = z.object({
  updates: z.array(ShapeUpdate).min(1).max(MAX_SHAPES_PER_CALL)
});
export type UpdateInput = z.infer<typeof UpdateInput>;

export interface UpdateResult {
  updated: number;
  /** Ids that were not on the canvas; these were skipped. */
  missing: string[];
}

export async function updateShape(bridge: Bridge, input: UpdateInput): Promise<UpdateResult> {
  if (!bridge.isConnected()) throw new NoBrowserError(bridge.canvasUrl());
  const reply = await bridge.send({
    op: "update",
    msgId: randomUUID(),
    updates: input.updates
  });
  const { count, missing } = expectAck(reply);
  return { updated: count, missing };
}
