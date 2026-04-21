import { describe, it, expect } from "vitest";
import { createShape, CreateInput } from "../src/tools/create.js";
import { FakeBridge } from "./fakeBridge.js";
import { NoBrowserError } from "../src/bridge.js";

describe("create_shape", () => {
  it("forwards a single rectangle and returns ids", async () => {
    const bridge = new FakeBridge({
      reply: (op) => ({ op: "ack", msgId: op.msgId, ok: true, ids: ["shape:rect-1"] })
    });
    const input = CreateInput.parse({
      shapes: [{ type: "geo", geo: "rectangle", x: 10, y: 20, w: 100, h: 50, color: "blue" }]
    });
    const result = await createShape(bridge, input);
    expect(bridge.sent).toHaveLength(1);
    expect(bridge.sent[0].op).toBe("create");
    expect(result).toEqual({ created: 1, ids: ["shape:rect-1"] });
  });

  it("batches multiple mixed shapes in one frame", async () => {
    const bridge = new FakeBridge();
    const input = CreateInput.parse({
      shapes: [
        { type: "geo", geo: "ellipse", x: 0, y: 0, w: 50, h: 50 },
        { type: "text", x: 60, y: 60, text: "hello" },
        { type: "arrow", x: 0, y: 100, end: { x: 100, y: 100 } },
        { type: "note", x: 200, y: 0, text: "sticky" },
        { type: "line", x: 0, y: 200, end: { x: 100, y: 200 } }
      ]
    });
    const result = await createShape(bridge, input);
    expect(bridge.sent).toHaveLength(1);
    if (bridge.sent[0].op !== "create") throw new Error("wrong op");
    expect(bridge.sent[0].shapes).toHaveLength(5);
    expect(result.created).toBe(5);
  });

  it("rejects invalid color before touching the bridge", () => {
    const bridge = new FakeBridge();
    expect(() =>
      CreateInput.parse({
        shapes: [{ type: "geo", geo: "rectangle", x: 0, y: 0, w: 10, h: 10, color: "neon-pink" }]
      })
    ).toThrow();
    expect(bridge.sent).toHaveLength(0);
  });

  it("returns the open-localhost hint when no browser is connected", async () => {
    const bridge = new FakeBridge({ connected: false });
    const input = CreateInput.parse({
      shapes: [{ type: "geo", geo: "rectangle", x: 0, y: 0, w: 10, h: 10 }]
    });
    await expect(createShape(bridge, input)).rejects.toBeInstanceOf(NoBrowserError);
  });
});
