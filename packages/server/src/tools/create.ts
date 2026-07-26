import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Shape, parseShape, MAX_SHAPES_PER_CALL } from "../shapes.js";
import { Bridge, NoBrowserError, expectAck } from "../bridge.js";

export const CreateInput = z.object({
  shapes: z.array(Shape).min(1).max(MAX_SHAPES_PER_CALL),
  fit: z.boolean().default(true).describe("Zoom the canvas to fit everything afterwards.")
});
export type CreateInput = z.infer<typeof CreateInput>;

export interface CreateResult {
  created: number;
  ids: string[];
}

export async function createShape(bridge: Bridge, input: CreateInput): Promise<CreateResult> {
  if (!bridge.isConnected()) throw new NoBrowserError(bridge.canvasUrl());

  // Re-validate each shape so arrow/line cross-field rules apply. The union
  // alone cannot express "an arrow needs `to` or `end`".
  const shapes = input.shapes.map((s, i) => {
    try {
      return parseShape(s);
    } catch (e) {
      const detail =
        e instanceof z.ZodError ? e.issues.map((x) => x.message).join("; ") : String(e);
      throw new Error(`shapes[${i}] (type "${(s as Shape).type}"): ${detail}`);
    }
  });

  const reply = await bridge.send({ op: "create", msgId: randomUUID(), shapes });
  const { ids } = expectAck(reply);

  if (input.fit) {
    try {
      await bridge.send({ op: "fit", msgId: randomUUID() });
    } catch {
      /* cosmetic only */
    }
  }

  return { created: shapes.length, ids };
}
