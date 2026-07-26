import { describe, it, expect } from "vitest";
import { createShape, CreateInput } from "../src/tools/create.js";
import { FakeBridge } from "./fakeBridge.js";
import { NoBrowserError } from "../src/bridge.js";

describe("create_shape", () => {
  it("forwards a single rectangle and returns ids", async () => {
    const bridge = new FakeBridge({
      reply: (op) => ({ op: "ack", msgId: op.msgId, ok: true, ids: ["rect-1"], count: 1 })
    });
    const input = CreateInput.parse({
      shapes: [{ type: "geo", geo: "rectangle", x: 10, y: 20, w: 100, h: 50, color: "blue" }]
    });
    const result = await createShape(bridge, input);
    expect(bridge.opsOfType("create")).toHaveLength(1);
    expect(result).toEqual({ created: 1, ids: ["rect-1"] });
  });

  it("batches multiple mixed shapes in one frame", async () => {
    const bridge = new FakeBridge();
    const input = CreateInput.parse({
      shapes: [
        { type: "geo", geo: "ellipse", x: 0, y: 0, w: 50, h: 50 },
        { type: "text", x: 60, y: 60, text: "hello" },
        { type: "arrow", x: 0, y: 100, end: { x: 100, y: 100 } },
        { type: "note", x: 200, y: 0, text: "sticky" },
        { type: "line", x: 0, y: 200, end: { x: 100, y: 200 } },
        { type: "frame", x: 400, y: 0, w: 300, h: 200, name: "Phase 1" }
      ]
    });
    const result = await createShape(bridge, input);
    const creates = bridge.opsOfType("create");
    expect(creates).toHaveLength(1);
    expect(creates[0].shapes).toHaveLength(6);
    expect(result.created).toBe(6);
  });

  it("accepts an arrow bound to two shapes by id", async () => {
    const bridge = new FakeBridge();
    const input = CreateInput.parse({
      shapes: [
        { type: "geo", id: "a", x: 0, y: 0, w: 100, h: 60, text: "A" },
        { type: "geo", id: "b", x: 300, y: 0, w: 100, h: 60, text: "B" },
        { type: "arrow", from: "a", to: "b", text: "goes to" }
      ]
    });
    const result = await createShape(bridge, input);
    const shapes = bridge.opsOfType("create")[0].shapes;
    expect(shapes[2]).toMatchObject({ type: "arrow", from: "a", to: "b" });
    expect(result.created).toBe(3);
  });

  it("rejects an arrow with neither a target shape nor an end point", async () => {
    const bridge = new FakeBridge();
    const input = CreateInput.parse({ shapes: [{ type: "arrow", x: 0, y: 0 }] });
    await expect(createShape(bridge, input)).rejects.toThrow(/end/i);
    expect(bridge.opsOfType("create")).toHaveLength(0);
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

  it("does not fail the draw when the cosmetic zoom-to-fit errors", async () => {
    const bridge = new FakeBridge({
      reply: (op) => {
        if (op.op === "fit") throw new Error("fit exploded");
        return { op: "ack", msgId: op.msgId, ok: true, ids: ["x"], count: 1 };
      }
    });
    const input = CreateInput.parse({ shapes: [{ type: "geo", x: 0, y: 0, w: 10, h: 10 }] });
    await expect(createShape(bridge, input)).resolves.toMatchObject({ created: 1 });
  });
});
