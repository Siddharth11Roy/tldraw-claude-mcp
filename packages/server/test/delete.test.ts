import { describe, it, expect } from "vitest";
import { deleteShape, DeleteInput } from "../src/tools/delete.js";
import { FakeBridge } from "./fakeBridge.js";

describe("delete_shape", () => {
  it("is a no-op for an empty array and never calls the bridge", async () => {
    const bridge = new FakeBridge();
    const input = DeleteInput.parse({ ids: [] });
    const result = await deleteShape(bridge, input);
    expect(result).toEqual({ deleted: 0 });
    expect(bridge.sent).toHaveLength(0);
  });

  it("forwards ids to the bridge", async () => {
    const bridge = new FakeBridge();
    const input = DeleteInput.parse({ ids: ["shape:1", "shape:2"] });
    const result = await deleteShape(bridge, input);
    expect(bridge.sent[0].op).toBe("delete");
    expect(result.deleted).toBe(2);
  });
});
