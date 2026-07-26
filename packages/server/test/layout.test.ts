import { describe, it, expect } from "vitest";
import { layoutGraph, type LayoutNode, type LayoutEdge } from "../src/layout.js";

const box = (id: string, w = 120, h = 60): LayoutNode => ({ id, w, h });

/** Do two placed boxes overlap? Touching edges do not count. */
function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("layoutGraph", () => {
  it("puts a linear chain on consecutive ranks", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const edges: LayoutEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" }
    ];
    const { nodes: placed } = layoutGraph(nodes, edges, { direction: "down" });
    expect(placed.get("a")!.rank).toBe(0);
    expect(placed.get("b")!.rank).toBe(1);
    expect(placed.get("c")!.rank).toBe(2);
    // Flow runs downward, so y must increase.
    expect(placed.get("b")!.y).toBeGreaterThan(placed.get("a")!.y);
    expect(placed.get("c")!.y).toBeGreaterThan(placed.get("b")!.y);
  });

  it("runs left-to-right when asked, without changing rank order", () => {
    const nodes = [box("a"), box("b")];
    const { nodes: placed } = layoutGraph(nodes, [{ from: "a", to: "b" }], {
      direction: "right"
    });
    expect(placed.get("b")!.x).toBeGreaterThan(placed.get("a")!.x);
    expect(placed.get("a")!.y).toBeCloseTo(placed.get("b")!.y, 0);
  });

  it("reverses the flow axis for `up` and `left`", () => {
    const nodes = [box("a"), box("b")];
    const edges = [{ from: "a", to: "b" }];
    const up = layoutGraph(nodes, edges, { direction: "up" }).nodes;
    expect(up.get("b")!.y).toBeLessThan(up.get("a")!.y);
    const left = layoutGraph(nodes, edges, { direction: "left" }).nodes;
    expect(left.get("b")!.x).toBeLessThan(left.get("a")!.x);
  });

  it("never overlaps two nodes, even in a wide fan-out", () => {
    const nodes = [box("root"), ...Array.from({ length: 12 }, (_, i) => box(`n${i}`, 140, 70))];
    const edges = Array.from({ length: 12 }, (_, i) => ({ from: "root", to: `n${i}` }));
    const { nodes: placed } = layoutGraph(nodes, edges, { direction: "down" });
    const all = [...placed.values()];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(overlaps(all[i], all[j]), `${all[i].id} overlaps ${all[j].id}`).toBe(false);
      }
    }
  });

  it("centres a parent over its children", () => {
    const nodes = [box("p"), box("c1"), box("c2")];
    const edges = [
      { from: "p", to: "c1" },
      { from: "p", to: "c2" }
    ];
    const { nodes: placed } = layoutGraph(nodes, edges, { direction: "down" });
    const p = placed.get("p")!;
    const c1 = placed.get("c1")!;
    const c2 = placed.get("c2")!;
    const childMid = (c1.x + c1.w / 2 + c2.x + c2.w / 2) / 2;
    expect(p.x + p.w / 2).toBeCloseTo(childMid, 0);
  });

  it("terminates on a cycle and reports the back edge", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" }
    ];
    const result = layoutGraph(nodes, edges, { direction: "down" });
    expect(result.backEdges).toHaveLength(1);
    expect(result.backEdges[0]).toEqual({ from: "c", to: "a" });
    expect(result.nodes.get("a")!.rank).toBe(0);
    expect(result.nodes.get("c")!.rank).toBe(2);
  });

  it("handles a self-loop without shifting the node's rank", () => {
    const nodes = [box("a"), box("b")];
    const edges = [
      { from: "a", to: "a" },
      { from: "a", to: "b" }
    ];
    const { nodes: placed } = layoutGraph(nodes, edges);
    expect(placed.get("a")!.rank).toBe(0);
    expect(placed.get("b")!.rank).toBe(1);
  });

  it("places disconnected nodes without crashing", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const { nodes: placed } = layoutGraph(nodes, []);
    expect(placed.size).toBe(3);
    for (const n of placed.values()) expect(n.rank).toBe(0);
  });

  it("respects an explicitly pinned rank", () => {
    const nodes = [box("a"), { ...box("b"), rank: 3 }];
    const { nodes: placed } = layoutGraph(nodes, [{ from: "a", to: "b" }]);
    expect(placed.get("b")!.rank).toBe(3);
  });

  it("reduces crossings on a graph whose natural order is tangled", () => {
    // a->y, b->x forces a crossing unless the second rank is reordered.
    const nodes = [box("a"), box("b"), box("x"), box("y")];
    const edges = [
      { from: "a", to: "y" },
      { from: "b", to: "x" }
    ];
    const { nodes: placed } = layoutGraph(nodes, edges, { direction: "down" });
    const a = placed.get("a")!, b = placed.get("b")!;
    const x = placed.get("x")!, y = placed.get("y")!;
    // Whichever way it settles, each edge's endpoints should stay on the same side.
    const aFirst = a.x < b.x;
    const yFirst = y.x < x.x;
    expect(aFirst).toBe(yFirst);
  });

  it("honours the origin and reports bounds that contain every node", () => {
    const nodes = [box("a"), box("b")];
    const result = layoutGraph(nodes, [{ from: "a", to: "b" }], {
      origin: { x: 500, y: 250 }
    });
    expect(result.bounds.x).toBeGreaterThanOrEqual(500);
    expect(result.bounds.y).toBe(250);
    for (const n of result.nodes.values()) {
      expect(n.x).toBeGreaterThanOrEqual(result.bounds.x);
      expect(n.x + n.w).toBeLessThanOrEqual(result.bounds.x + result.bounds.w);
      expect(n.y + n.h).toBeLessThanOrEqual(result.bounds.y + result.bounds.h);
    }
  });

  it("keeps a minimum gap between siblings", () => {
    const nodes = [box("p"), box("c1"), box("c2"), box("c3")];
    const edges = ["c1", "c2", "c3"].map((c) => ({ from: "p", to: c }));
    const { nodes: placed, ranks } = layoutGraph(nodes, edges, { nodeGap: 80 });
    const row = ranks[1].map((id) => placed.get(id)!).sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      expect(row[i].x - (row[i - 1].x + row[i - 1].w)).toBeGreaterThanOrEqual(79);
    }
  });

  it("survives a large graph quickly", () => {
    const nodes = Array.from({ length: 200 }, (_, i) => box(`n${i}`));
    const edges = Array.from({ length: 199 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` }));
    const started = Date.now();
    const { nodes: placed } = layoutGraph(nodes, edges);
    expect(placed.size).toBe(200);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
