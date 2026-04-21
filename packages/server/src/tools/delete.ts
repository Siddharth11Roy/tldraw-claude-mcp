import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Bridge, NoBrowserError } from "../bridge.js";
import { MAX_SHAPES_PER_CALL } from "../shapes.js";

export const DeleteInput = z.object({
  ids: z.array(z.string().min(1)).max(MAX_SHAPES_PER_CALL)
});
export type DeleteInput = z.infer<typeof DeleteInput>;

export interface DeleteResult {
  deleted: number;
}

export async function deleteShape(bridge: Bridge, input: DeleteInput): Promise<DeleteResult> {
  if (input.ids.length === 0) return { deleted: 0 };
  if (!bridge.isConnected()) throw new NoBrowserError();
  const reply = await bridge.send({ op: "delete", msgId: randomUUID(), ids: input.ids });
  if (reply.op !== "ack" || !reply.ok) {
    const message = reply.op === "ack" ? reply.message : "Unexpected reply from browser.";
    throw new Error(message);
  }
  return { deleted: input.ids.length };
}
