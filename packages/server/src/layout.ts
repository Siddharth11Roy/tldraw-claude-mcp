// Layered (Sugiyama-style) graph layout.
//
// This is the piece that makes diagrams look deliberate instead of hand-placed.
// A model asked to emit raw x/y for every node produces overlapping boxes,
// inconsistent gaps and crossing edges. Here it emits a graph and we do the
// geometry: rank assignment -> crossing reduction -> coordinate assignment.
//
// Pure functions, no tldraw types — so it is cheap to unit-test.

export type Direction = "down" | "up" | "right" | "left";

export interface LayoutNode {
  id: string;
  w: number;
  h: number;
  /** Pin a node to an explicit rank instead of deriving one. */
  rank?: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface LayoutConfig {
  direction?: Direction;
  /** Gap between consecutive ranks, along the flow axis. */
  rankGap?: number;
  /** Gap between neighbours within a rank, along the cross axis. */
  nodeGap?: number;
  origin?: { x: number; y: number };
}

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rank: number;
  order: number;
}

export interface LayoutResult {
  nodes: Map<string, PlacedNode>;
  ranks: string[][];
  /** Edges that point against the flow; useful for styling feedback loops. */
  backEdges: LayoutEdge[];
  bounds: { x: number; y: number; w: number; h: number };
}

const DEFAULTS = {
  direction: "down" as Direction,
  rankGap: 90,
  nodeGap: 56,
  origin: { x: 100, y: 100 }
};

/** Flow runs along y for down/up, along x for right/left. */
function isVertical(dir: Direction): boolean {
  return dir === "down" || dir === "up";
}

export function layoutGraph(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  config: LayoutConfig = {}
): LayoutResult {
  const direction = config.direction ?? DEFAULTS.direction;
  const rankGap = config.rankGap ?? DEFAULTS.rankGap;
  const nodeGap = config.nodeGap ?? DEFAULTS.nodeGap;
  const origin = config.origin ?? DEFAULTS.origin;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  // Ignore edges pointing at nodes that were never declared, and self-loops
  // (they render as a bend on the node, they must not affect ranking).
  const real = edges.filter(
    (e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to
  );

  const { rank, backEdges } = assignRanks(nodes, real);
  const ranks = groupByRank(nodes, rank);
  const forward = real.filter((e) => !backEdges.includes(e));
  orderWithinRanks(ranks, forward, rank);
  const placed = assignCoordinates(ranks, forward, byId, {
    direction,
    rankGap,
    nodeGap,
    origin
  });

  return { nodes: placed, ranks, backEdges, bounds: boundsOf(placed) };
}

// ---------------------------------------------------------------------------
// 1. Rank assignment (longest path over the DAG formed by dropping back edges)
// ---------------------------------------------------------------------------

function assignRanks(
  nodes: LayoutNode[],
  edges: LayoutEdge[]
): { rank: Map<string, number>; backEdges: LayoutEdge[] } {
  const out = new Map<string, LayoutEdge[]>();
  for (const n of nodes) out.set(n.id, []);
  for (const e of edges) out.get(e.from)!.push(e);

  // DFS colouring: an edge into a node still on the stack closes a cycle.
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map<string, number>(nodes.map((n) => [n.id, WHITE]));
  const backEdges: LayoutEdge[] = [];

  // Iterative DFS — deep graphs would blow the call stack otherwise.
  for (const root of nodes) {
    if (colour.get(root.id) !== WHITE) continue;
    const stack: { id: string; i: number }[] = [{ id: root.id, i: 0 }];
    colour.set(root.id, GREY);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const outEdges = out.get(frame.id)!;
      if (frame.i >= outEdges.length) {
        colour.set(frame.id, BLACK);
        stack.pop();
        continue;
      }
      const edge = outEdges[frame.i++];
      const c = colour.get(edge.to);
      if (c === GREY) {
        backEdges.push(edge);
      } else if (c === WHITE) {
        colour.set(edge.to, GREY);
        stack.push({ id: edge.to, i: 0 });
      }
    }
  }

  const dag = edges.filter((e) => !backEdges.includes(e));

  // Kahn topological order, then rank = longest path from any source.
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const succ = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of dag) {
    indeg.set(e.to, indeg.get(e.to)! + 1);
    succ.get(e.from)!.push(e.to);
  }

  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of succ.get(id)!) {
      rank.set(next, Math.max(rank.get(next)!, rank.get(id)! + 1));
      indeg.set(next, indeg.get(next)! - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }

  // Honour explicit pins, then re-normalise so the minimum rank is 0.
  for (const n of nodes) if (n.rank !== undefined) rank.set(n.id, n.rank);
  const min = Math.min(...rank.values());
  if (min !== 0) for (const [k, v] of rank) rank.set(k, v - min);

  return { rank, backEdges };
}

function groupByRank(nodes: LayoutNode[], rank: Map<string, number>): string[][] {
  const max = Math.max(0, ...rank.values());
  const ranks: string[][] = Array.from({ length: max + 1 }, () => []);
  // Seed each rank in declaration order — stable input ordering is a large part
  // of a diagram reading the way the author described it.
  for (const n of nodes) ranks[rank.get(n.id)!].push(n.id);
  return ranks;
}

// ---------------------------------------------------------------------------
// 2. Crossing reduction (barycentre sweeps, keep the best ordering seen)
// ---------------------------------------------------------------------------

function orderWithinRanks(
  ranks: string[][],
  edges: LayoutEdge[],
  rank: Map<string, number>
): void {
  if (ranks.length < 2) return;

  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const e of edges) {
    if (!succs.has(e.from)) succs.set(e.from, []);
    if (!preds.has(e.to)) preds.set(e.to, []);
    succs.get(e.from)!.push(e.to);
    preds.get(e.to)!.push(e.from);
  }

  let best = ranks.map((r) => [...r]);
  let bestCrossings = countCrossings(ranks, edges, rank);

  for (let pass = 0; pass < 8; pass++) {
    const downward = pass % 2 === 0;
    const indices = positionIndex(ranks);

    if (downward) {
      for (let r = 1; r < ranks.length; r++) {
        sortByBarycentre(ranks[r], preds, indices);
      }
    } else {
      for (let r = ranks.length - 2; r >= 0; r--) {
        sortByBarycentre(ranks[r], succs, indices);
      }
    }

    const crossings = countCrossings(ranks, edges, rank);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      best = ranks.map((r) => [...r]);
    }
    if (bestCrossings === 0) break;
  }

  for (let r = 0; r < ranks.length; r++) ranks[r] = best[r];
}

function positionIndex(ranks: string[][]): Map<string, number> {
  const idx = new Map<string, number>();
  for (const rankRow of ranks) rankRow.forEach((id, i) => idx.set(id, i));
  return idx;
}

function sortByBarycentre(
  row: string[],
  neighbours: Map<string, string[]>,
  indices: Map<string, number>
): void {
  const current = new Map(row.map((id, i) => [id, i]));
  const key = new Map<string, number>();
  for (const id of row) {
    const ns = neighbours.get(id) ?? [];
    const known = ns.map((n) => indices.get(n)).filter((v): v is number => v !== undefined);
    // No neighbours in the adjacent rank: keep the node where it is.
    key.set(id, known.length ? known.reduce((a, b) => a + b, 0) / known.length : current.get(id)!);
  }
  row.sort((a, b) => (key.get(a)! - key.get(b)!) || (current.get(a)! - current.get(b)!));
}

function countCrossings(
  ranks: string[][],
  edges: LayoutEdge[],
  rank: Map<string, number>
): number {
  const idx = positionIndex(ranks);
  let total = 0;
  for (let r = 0; r < ranks.length - 1; r++) {
    const between = edges.filter(
      (e) => rank.get(e.from) === r && rank.get(e.to) === r + 1
    );
    for (let i = 0; i < between.length; i++) {
      for (let j = i + 1; j < between.length; j++) {
        const a = between[i], b = between[j];
        const a1 = idx.get(a.from)!, a2 = idx.get(a.to)!;
        const b1 = idx.get(b.from)!, b2 = idx.get(b.to)!;
        if ((a1 - b1) * (a2 - b2) < 0) total++;
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// 3. Coordinate assignment
// ---------------------------------------------------------------------------

interface CoordConfig {
  direction: Direction;
  rankGap: number;
  nodeGap: number;
  origin: { x: number; y: number };
}

function assignCoordinates(
  ranks: string[][],
  edges: LayoutEdge[],
  byId: Map<string, LayoutNode>,
  cfg: CoordConfig
): Map<string, PlacedNode> {
  const vertical = isVertical(cfg.direction);
  // Extent along each axis. "cross" is the axis nodes spread across.
  const crossSize = (id: string) => (vertical ? byId.get(id)!.w : byId.get(id)!.h);
  const flowSize = (id: string) => (vertical ? byId.get(id)!.h : byId.get(id)!.w);

  // --- flow axis: stack ranks, each as tall/wide as its biggest member ---
  const flowStart: number[] = [];
  let cursor = 0;
  for (const row of ranks) {
    flowStart.push(cursor);
    const extent = row.length ? Math.max(...row.map(flowSize)) : 0;
    cursor += extent + cfg.rankGap;
  }

  // --- cross axis: pack, then pull toward neighbours, then fix overlaps ---
  const cross = new Map<string, number>(); // centre position on the cross axis
  for (const row of ranks) {
    let at = 0;
    for (const id of row) {
      cross.set(id, at + crossSize(id) / 2);
      at += crossSize(id) + cfg.nodeGap;
    }
  }

  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const e of edges) {
    if (!succs.has(e.from)) succs.set(e.from, []);
    if (!preds.has(e.to)) preds.set(e.to, []);
    succs.get(e.from)!.push(e.to);
    preds.get(e.to)!.push(e.from);
  }

  // Alternate downward/upward passes: nudge each node toward the average of its
  // neighbours in the adjacent rank, then re-separate. This is what makes
  // parents sit centred over their children.
  for (let pass = 0; pass < 6; pass++) {
    const rows = pass % 2 === 0
      ? ranks.map((_, i) => i).slice(1)
      : ranks.map((_, i) => i).slice(0, -1).reverse();
    const neighbours = pass % 2 === 0 ? preds : succs;

    for (const r of rows) {
      for (const id of ranks[r]) {
        const ns = neighbours.get(id) ?? [];
        const positions = ns.map((n) => cross.get(n)).filter((v): v is number => v !== undefined);
        if (positions.length) {
          cross.set(id, positions.reduce((a, b) => a + b, 0) / positions.length);
        }
      }
      separate(ranks[r], cross, crossSize, cfg.nodeGap);
    }
  }

  // Centre every rank on a common axis so the diagram is symmetric overall.
  const centres = ranks
    .filter((r) => r.length)
    .map((r) => {
      const lo = Math.min(...r.map((id) => cross.get(id)! - crossSize(id) / 2));
      const hi = Math.max(...r.map((id) => cross.get(id)! + crossSize(id) / 2));
      return { lo, hi, mid: (lo + hi) / 2 };
    });
  const globalMid = centres.length
    ? centres.reduce((a, c) => a + c.mid, 0) / centres.length
    : 0;
  for (const row of ranks) {
    if (!row.length) continue;
    const lo = Math.min(...row.map((id) => cross.get(id)! - crossSize(id) / 2));
    const hi = Math.max(...row.map((id) => cross.get(id)! + crossSize(id) / 2));
    const shift = globalMid - (lo + hi) / 2;
    for (const id of row) cross.set(id, cross.get(id)! + shift);
  }

  // Normalise so nothing sits at a negative offset before applying the origin.
  const minCross = Math.min(
    ...[...cross.entries()].map(([id, c]) => c - crossSize(id) / 2)
  );
  const totalFlow = cursor - cfg.rankGap;

  const placed = new Map<string, PlacedNode>();
  ranks.forEach((row, r) => {
    // Shorter nodes sit centred within their rank's band.
    const rowExtent = row.length ? Math.max(...row.map(flowSize)) : 0;
    row.forEach((id, order) => {
      const n = byId.get(id)!;
      const c = cross.get(id)! - minCross - (vertical ? n.w : n.h) / 2;
      // For up/left the ranks run backwards from the far end.
      const forwardF = flowStart[r] + (rowExtent - flowSize(id)) / 2;
      const f =
        cfg.direction === "down" || cfg.direction === "right"
          ? forwardF
          : totalFlow - forwardF - flowSize(id);

      placed.set(id, {
        id,
        x: cfg.origin.x + (vertical ? c : f),
        y: cfg.origin.y + (vertical ? f : c),
        w: n.w,
        h: n.h,
        rank: r,
        order
      });
    });
  });

  return placed;
}

/**
 * Enforce a minimum gap between neighbours while staying as close as possible
 * to each node's desired position. Sweep forward, then backward.
 */
function separate(
  row: string[],
  cross: Map<string, number>,
  size: (id: string) => number,
  gap: number
): void {
  for (let i = 1; i < row.length; i++) {
    const prev = row[i - 1], cur = row[i];
    const min = cross.get(prev)! + size(prev) / 2 + gap + size(cur) / 2;
    if (cross.get(cur)! < min) cross.set(cur, min);
  }
  for (let i = row.length - 2; i >= 0; i--) {
    const next = row[i + 1], cur = row[i];
    const max = cross.get(next)! - size(next) / 2 - gap - size(cur) / 2;
    if (cross.get(cur)! > max) cross.set(cur, max);
  }
}

function boundsOf(placed: Map<string, PlacedNode>): { x: number; y: number; w: number; h: number } {
  if (placed.size === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const all = [...placed.values()];
  const x = Math.min(...all.map((n) => n.x));
  const y = Math.min(...all.map((n) => n.y));
  const right = Math.max(...all.map((n) => n.x + n.w));
  const bottom = Math.max(...all.map((n) => n.y + n.h));
  return { x, y, w: right - x, h: bottom - y };
}
