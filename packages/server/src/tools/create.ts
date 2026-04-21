import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Shape, MAX_SHAPES_PER_CALL } from "../shapes.js";
import { Bridge, NoBrowserError } from "../bridge.js";

export const CreateInput = z.object({
  shapes: z.array(Shape).min(1).max(MAX_SHAPES_PER_CALL)
});
export type CreateInput = z.infer<typeof CreateInput>;

export interface CreateResult {
  created: number;
  ids: string[];
}

export async function createShape(bridge: Bridge, input: CreateInput): Promise<CreateResult> {
  if (!bridge.isConnected()) throw new NoBrowserError();
  const reply = await bridge.send({ op: "create", msgId: randomUUID(), shapes: input.shapes });
  if (reply.op !== "ack" || !reply.ok) {
    const message = reply.op === "ack" ? reply.message : "Unexpected reply from browser.";
    throw new Error(message);
  }
  return { created: input.shapes.length, ids: reply.ids ?? [] };
}
