import { describe, it, expect } from "vitest";
import { createDiagram, DiagramInput } from "../src/tools/diagram.js";
import { FakeBridge } from "./fakeBridge.js";
import type { BridgeOp } from "../src/bridge.js";

function shapesFrom(bridge: FakeBridge) {
  const create = bridge.opsOfType("create")[0] as Extract<BridgeOp, { op: "create" }>;
  return create.shapes as any[];
}

const loginFlow = {
  direction: "down",
  nodes: [
    { id: "start", label: "Start", role: "start" },
    { id: "form", label: "Show login form" },
    { id: "check", label: "Credentials valid?", role: "decision" },
    { id: "home", label: "Go to dashboard", role: "success" },
    { id: "retry", label: "Show error", role: "error" }
  ],
  edges: [
    { from: "start", to: "form" },
    { from: "form", to: "check" },
    { from: "check", to: "home", label: "yes" },
    { from: "check", to: "retry", label: "no" },
    { from: "retry", to: "form" }
  ]
};

describe("create_diagram", () => {
  it("emits a node shape per node and a bound arrow per edge", async () => {
    const bridge = new FakeBridge();
    const result = await createDiagram(bridge, DiagramInput.parse(loginFlow));

    const shapes = shapesFrom(bridge);
    const geos = shapes.filter((s) => s.type === "geo");
    const arrows = shapes.filter((s) => s.type === "arrow");

    expect(geos).toHaveLength(5);
    expect(arrows).toHaveLength(5);
    // Every connector is bound by id — never by raw coordinates.
    for (const a of arrows) {
      expect(a.from).toBeTruthy();
      expect(a.to).toBeTruthy();
      expect(a.end).toBeUndefined();
    }
    expect(result.nodes).toBe(5);
    expect(result.edges).toBe(5);
  });

  it("maps semantic roles onto conventional shapes and colours", async () => {
    const bridge = new FakeBridge();
    await createDiagram(bridge, DiagramInput.parse(loginFlow));
    const shapes = shapesFrom(bridge);
    const byId = Object.fromEntries(shapes.map((s) => [s.id, s]));

    expect(byId.check.geo).toBe("diamond");
    expect(byId.start.geo).toBe("oval");
    expect(byId.form.geo).toBe("rectangle");
    // success/error read through colour: tldraw's check-box and x-box draw
    // their mark straight through the label.
    expect(byId.home).toMatchObject({ geo: "rectangle", color: "green" });
    expect(byId.retry).toMatchObject({ geo: "rectangle", color: "red" });
  });

  it("sizes nodes to their label instead of using a fixed box", async () => {
    const bridge = new FakeBridge();
    await createDiagram(
      bridge,
      DiagramInput.parse({
        nodes: [
          { id: "short", label: "Hi" },
          { id: "long", label: "Validate the incoming webhook signature" }
        ],
        edges: [{ from: "short", to: "long" }]
      })
    );
    const byId = Object.fromEntries(shapesFrom(bridge).map((s) => [s.id, s]));
    expect(byId.long.w).toBeGreaterThan(byId.short.w);
  });

  it("lays a `right` diagram out horizontally", async () => {
    const bridge = new FakeBridge();
    await createDiagram(
      bridge,
      DiagramInput.parse({
        direction: "right",
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        edges: [{ from: "a", to: "b" }]
      })
    );
    const byId = Object.fromEntries(shapesFrom(bridge).map((s) => [s.id, s]));
    expect(byId.b.x).toBeGreaterThan(byId.a.x);
  });

  it("defaults to elbow connectors and lets an edge override them", async () => {
    const bridge = new FakeBridge();
    await createDiagram(
      bridge,
      DiagramInput.parse({
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        edges: [{ from: "a", to: "b" }, { from: "b", to: "a", kind: "arc", dash: "dashed" }]
      })
    );
    const arrows = shapesFrom(bridge).filter((s) => s.type === "arrow");
    expect(arrows[0].kind).toBe("elbow");
    expect(arrows[1].kind).toBe("arc");
    expect(arrows[1].dash).toBe("dashed");
  });

  it("reports the feedback loop in a cyclic flow", async () => {
    const bridge = new FakeBridge();
    const result = await createDiagram(bridge, DiagramInput.parse(loginFlow));
    // retry -> form closes the loop back to an earlier rank.
    expect(result.backEdges).toContainEqual({ from: "retry", to: "form" });
  });

  it("drops edges that reference an undeclared node and says so", async () => {
    const bridge = new FakeBridge();
    const result = await createDiagram(
      bridge,
      DiagramInput.parse({
        nodes: [{ id: "a", label: "A" }],
        edges: [{ from: "a", to: "nowhere" }]
      })
    );
    expect(result.edges).toBe(0);
    expect(result.warnings[0]).toMatch(/nowhere/);
    expect(shapesFrom(bridge).filter((s) => s.type === "arrow")).toHaveLength(0);
  });

  it("rejects duplicate node ids rather than silently merging them", async () => {
    const bridge = new FakeBridge();
    await expect(
      createDiagram(
        bridge,
        DiagramInput.parse({
          nodes: [{ id: "a", label: "One" }, { id: "a", label: "Two" }],
          edges: []
        })
      )
    ).rejects.toThrow(/Duplicate node ids/);
  });

  it("clears the canvas first only when asked", async () => {
    const plain = new FakeBridge();
    await createDiagram(
      plain,
      DiagramInput.parse({ nodes: [{ id: "a", label: "A" }], edges: [] })
    );
    expect(plain.opsOfType("clear")).toHaveLength(0);

    const replacing = new FakeBridge();
    await createDiagram(
      replacing,
      DiagramInput.parse({ nodes: [{ id: "a", label: "A" }], edges: [], replace: true })
    );
    expect(replacing.opsOfType("clear")).toHaveLength(1);
    // Clear must precede the draw.
    expect(replacing.sent[0].op).toBe("clear");
  });

  it("adds a title above the diagram without colliding with node ids", async () => {
    const bridge = new FakeBridge();
    await createDiagram(
      bridge,
      DiagramInput.parse({
        title: "Login flow",
        nodes: [{ id: "d-title", label: "Tricky id" }],
        edges: []
      })
    );
    const shapes = shapesFrom(bridge);
    const title = shapes.find((s) => s.type === "text");
    expect(title.text).toBe("Login flow");
    expect(title.id).not.toBe("d-title");
  });

  it("gives labelled edges more room between ranks", async () => {
    const build = async (label?: string) => {
      const bridge = new FakeBridge();
      await createDiagram(
        bridge,
        DiagramInput.parse({
          nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
          edges: [{ from: "a", to: "b", ...(label ? { label } : {}) }]
        })
      );
      const byId = Object.fromEntries(shapesFrom(bridge).map((s) => [s.id, s]));
      return byId.b.y - byId.a.y;
    };
    expect(await build("yes")).toBeGreaterThan(await build());
  });
});
