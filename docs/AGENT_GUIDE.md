# Agent guide — drawing on the tldraw canvas

Portable usage guidance for the `tldraw` MCP server. Claude Code gets this from
the bundled skill; **Codex and other MCP clients have no skill mechanism**, so
paste this file (or the short version at the bottom) into your `AGENTS.md`.

The server also ships the same rules as MCP `instructions` and in each tool's
description, so a client that surfaces those already has the essentials.

---

## Which tool

| Situation | Tool |
|---|---|
| Anything shaped like a graph: flowchart, architecture, state machine, sequence, org chart, dependency tree, mind map | `create_diagram` |
| Free-form drawing, wireframes, annotations, adding to an existing sketch | `create_shape` |
| Linking shapes that already exist | `connect_shapes` |
| Changing something already drawn | `get_canvas`, then `update_shape` |

**`create_diagram` is the replacement for writing mermaid.** Describe the graph;
the server measures every label, assigns layers, minimises edge crossings and
binds the connectors. Do not compute `x`/`y` for it — hand-placed coordinates
are what produce overlapping boxes and crossing arrows.

## The one rule about links

Connect shapes **by id**, never by coordinates:

```jsonc
{ "type": "arrow", "from": "login", "to": "dashboard", "text": "on success" }
```

A bound arrow anchors on each shape's edge and re-routes when either end moves.
An arrow drawn from raw `start`/`end` points just overlaps whatever is in the
way. Only use raw points to gesture at empty space.

## create_diagram

```jsonc
{
  "title": "Login flow",
  "direction": "down",          // down = mermaid TD, right = mermaid LR
  "connector": "elbow",         // right-angled; "arc" for curved
  "nodes": [
    { "id": "start",  "label": "Start",              "role": "start" },
    { "id": "form",   "label": "Show login form" },
    { "id": "check",  "label": "Credentials valid?", "role": "decision" },
    { "id": "home",   "label": "Go to dashboard",    "role": "success" },
    { "id": "retry",  "label": "Show error",         "role": "error" }
  ],
  "edges": [
    { "from": "start", "to": "form" },
    { "from": "form",  "to": "check" },
    { "from": "check", "to": "home",  "label": "yes" },
    { "from": "check", "to": "retry", "label": "no" },
    { "from": "retry", "to": "form" }
  ]
}
```

**Roles** set shape and colour conventionally, so you describe meaning rather
than styling: `process` (default), `start`, `end`, `decision`, `io`, `data`,
`external`, `error`, `success`, `note`.

Useful extras: `replace: true` clears the canvas first (use when redrawing from
scratch); `rank` pins a node to a layer; `spacing`, `origin` override geometry.

Edges that close a cycle are detected automatically and bowed around the outside
of the diagram, so feedback loops don't cut back through the nodes.

Re-running `create_diagram` with the same node ids **updates in place** rather
than duplicating — iterate freely.

## create_shape

Types: `geo`, `text`, `arrow`, `line`, `draw`, `note`, `frame`.

- `geo` — omit `w`/`h` to auto-size the box to its `text`.
- `arrow` — prefer `from`/`to`; `kind: "elbow"` for right angles.
- `line` — `points: [...]` for multi-segment, or just `end`.
- `draw` — freehand, `points` with ≥2 entries.
- `note` — sticky, fixed size.
- `frame` — titled container for grouping phases or subsystems.

Coordinates: origin top-left, `+x` right, `+y` down. Give shapes an `id` so you
can reference them later.

Colours: `black, grey, light-violet, violet, blue, light-blue, yellow, orange,
green, light-green, light-red, red, white`.
Fills: `none, semi, solid, pattern, fill`. Dashes: `draw, solid, dashed, dotted`.

## Editing

Call `get_canvas` first — it returns every shape with resolved geometry, its
label, and for arrows the ids each end is bound to. Then `update_shape` with the
same field names used to create it:

```jsonc
{ "updates": [{ "id": "check", "props": { "color": "red", "text": "Valid?" } }] }
```

`delete_shape({ ids: [...] })` removes shapes; `delete_shape({ all: true })`
clears the canvas. Arrows bound to a deleted shape go with it.

## Before you start

The user has to have the canvas open. If a tool reports no canvas is connected,
tell them to open the URL in the error (default `http://localhost:3030`) and
retry.

---

## Short version for AGENTS.md

```markdown
## tldraw canvas

A `tldraw` MCP server draws on a live canvas at http://localhost:3030.

- For any node-and-edge diagram (flowchart, architecture, state machine, org
  chart, dependency graph) use `create_diagram` instead of writing mermaid.
  Give it nodes + edges and a `direction`; it does the layout. Never compute
  x/y for it.
- Node `role` sets conventional styling: process, start, end, decision, io,
  data, external, error, success, note.
- Link shapes by id (`from`/`to`), never by coordinates — bound arrows anchor on
  shape edges and follow them.
- Use `create_shape` only for free-form drawing and annotation.
- Call `get_canvas` before editing anything already on the canvas.
- Re-running `create_diagram` with the same node ids updates in place.
```
