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
        shapes: [{ id: "a", type: "geo", x: 0, y: 0, w: 10, h: 10, text: "A" }],
        bounds: { x: 0, y: 0, w: 10, h: 10 }
      })
    });
    const result = await getCanvas(bridge);
    expect(bridge.sent[0].op).toBe("query");
    expect(result.count).toBe(1);
    expect(result.bounds).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });

  it("reports how arrows are wired so follow-up edits can reason about links", async () => {
    const bridge = new FakeBridge({
      reply: (op) => ({
        op: "state",
        msgId: op.msgId,
        shapes: [{ id: "e0", type: "arrow", x: 0, y: 0, from: "login", to: "dashboard" }]
      })
    });
    const result = await getCanvas(bridge);
    expect(result.shapes[0]).toMatchObject({ from: "login", to: "dashboard" });
  });

  it("propagates a bridge timeout instead of hanging", async () => {
    const bridge = new FakeBridge({ hang: true, timeoutMs: 20 });
    await expect(getCanvas(bridge)).rejects.toBeInstanceOf(BridgeTimeoutError);
  });
});
