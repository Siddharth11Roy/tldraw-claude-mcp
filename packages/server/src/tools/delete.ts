import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Bridge, NoBrowserError, expectAck } from "../bridge.js";
import { MAX_SHAPES_PER_CALL } from "../shapes.js";

export const DeleteInput = z.object({
  // Defaulted, not required: `{ all: true }` on its own has to be a valid call.
  ids: z.array(z.string().min(1)).max(MAX_SHAPES_PER_CALL).default([])
    .describe("Shape ids to remove. Arrows bound to a deleted shape are removed with it."),
  all: z.boolean().default(false).describe("Delete everything on the page; ignores `ids`.")
});
export type DeleteInput = z.infer<typeof DeleteInput>;

export interface DeleteResult {
  deleted: number;
}

export async function deleteShape(bridge: Bridge, input: DeleteInput): Promise<DeleteResult> {
  if (!input.all && input.ids.length === 0) return { deleted: 0 };
  if (!bridge.isConnected()) throw new NoBrowserError(bridge.canvasUrl());

  const reply = input.all
    ? await bridge.send({ op: "clear", msgId: randomUUID() })
    : await bridge.send({ op: "delete", msgId: randomUUID(), ids: input.ids });

  const { count } = expectAck(reply);
  return { deleted: count };
}
