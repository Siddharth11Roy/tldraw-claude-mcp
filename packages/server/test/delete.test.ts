import { describe, it, expect } from "vitest";
import { deleteShape, DeleteInput } from "../src/tools/delete.js";
import { FakeBridge } from "./fakeBridge.js";

describe("delete_shape", () => {
  it("is a no-op for an empty array and never calls the bridge", async () => {
    const bridge = new FakeBridge();
    const result = await deleteShape(bridge, DeleteInput.parse({ ids: [] }));
    expect(result).toEqual({ deleted: 0 });
    expect(bridge.sent).toHaveLength(0);
  });

  it("forwards ids to the bridge", async () => {
    const bridge = new FakeBridge({
      reply: (op) => ({ op: "ack", msgId: op.msgId, ok: true, count: 2 })
    });
    const result = await deleteShape(bridge, DeleteInput.parse({ ids: ["a", "b"] }));
    expect(bridge.sent[0].op).toBe("delete");
    expect(result.deleted).toBe(2);
  });

  it("sends a clear op when asked to delete everything", async () => {
    const bridge = new FakeBridge({
      reply: (op) => ({ op: "ack", msgId: op.msgId, ok: true, count: 7 })
    });
    // `{ all: true }` alone must be valid — `ids` is not required.
    const result = await deleteShape(bridge, DeleteInput.parse({ all: true }));
    expect(bridge.sent[0].op).toBe("clear");
    expect(result.deleted).toBe(7);
  });

  it("does not require ids", () => {
    expect(() => DeleteInput.parse({})).not.toThrow();
    expect(DeleteInput.parse({}).ids).toEqual([]);
  });
});
