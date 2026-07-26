import { describe, it, expect } from "vitest";
import { updateShape, UpdateInput } from "../src/tools/update.js";
import { FakeBridge } from "./fakeBridge.js";

describe("update_shape", () => {
  it("forwards updates to the bridge", async () => {
    const bridge = new FakeBridge();
    const input = UpdateInput.parse({ updates: [{ id: "n1", props: { x: 99 } }] });
    const result = await updateShape(bridge, input);
    expect(bridge.sent[0].op).toBe("update");
    expect(result.updated).toBe(1);
  });

  it("reports ids that were not on the canvas instead of failing the batch", async () => {
    const bridge = new FakeBridge({
      reply: (op) => ({ op: "ack", msgId: op.msgId, ok: true, count: 1, missing: ["ghost"] })
    });
    const input = UpdateInput.parse({
      updates: [{ id: "real", props: { color: "red" } }, { id: "ghost", props: { x: 0 } }]
    });
    const result = await updateShape(bridge, input);
    expect(result).toEqual({ updated: 1, missing: ["ghost"] });
  });

  it("surfaces a structured error when the browser rejects the batch", async () => {
    const bridge = new FakeBridge({
      reply: (op) => ({ op: "ack", msgId: op.msgId, ok: false, message: "Unknown shape id: ghost" })
    });
    const input = UpdateInput.parse({ updates: [{ id: "ghost", props: { x: 0 } }] });
    await expect(updateShape(bridge, input)).rejects.toThrow(/Unknown shape id/);
  });
});
