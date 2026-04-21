import { describe, it, expect } from "vitest";
import { getCanvas } from "../src/tools/getCanvas.js";
import { FakeBridge } from "./fakeBridge.js";
import { BridgeTimeoutError } from "../src/bridge.js";

describe("get_canvas", () => {
  it("issues a query and returns the parsed state reply", async () => {
    const bridge = new FakeBridge({
      reply: (op) => ({
        op: "state",
        msgId: op.msgId,
        shapes: [{ type: "geo", geo: "rectangle", x: 0, y: 0, w: 10, h: 10 }]
      })
    });
    const result = await getCanvas(bridge);
    expect(bridge.sent[0].op).toBe("query");
    expect(result.shapes).toHaveLength(1);
  });

  it("propagates a bridge timeout instead of hanging", async () => {
    const bridge = new FakeBridge({ hang: true, timeoutMs: 20 });
    await expect(getCanvas(bridge)).rejects.toBeInstanceOf(BridgeTimeoutError);
  });
});
