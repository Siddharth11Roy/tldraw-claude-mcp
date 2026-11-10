---
name: tldraw
description: Draw, diagram, sketch, wireframe, mind-map, or flowchart on a live tldraw canvas via the tldraw-mcp server. Use whenever the user asks to visualize, draw, sketch, diagram, or lay out something graphically — and instead of writing mermaid when a canvas is available.
---

# tldraw skill

You can draw on a live tldraw canvas through the `tldraw` MCP server. The user
watches your output appear in real time at `http://localhost:3030`.

## Before drawing

If you have not drawn yet this session, tell the user once:

> Open `http://localhost:3030` in your browser to see the canvas.

If a tool reports that no canvas is connected, pass on the URL from that error
(if :3030 was busy the server moves to :3031, :3032, … and the error names the
real one), and retry once the user has it open.

## Pick the right tool

| Situation | Tool |
|---|---|
| Flowchart, architecture, state machine, sequence, org chart, dependency graph, mind map — anything with nodes and edges | `create_diagram` |
| Free-form drawing, wireframes, annotations, sketching | `create_shape` |
| Linking shapes that already exist | `connect_shapes` |
| Changing something already drawn | `get_canvas` → `update_shape` |

**Use `create_diagram` instead of writing mermaid.** It takes the same
nodes-and-edges description and renders it natively: it measures each label,
assigns layers, minimises crossings and binds the connectors.

**Never compute `x`/`y` for a diagram.** Hand-placed coordinates are what
produce overlapping boxes and crossing arrows — that is exactly the work this
tool exists to do.

## create_diagram

```json
{
  "title": "Login flow",
  "direction": "down",
  "nodes": [
    { "id": "start", "label": "Start", "role": "start" },
    { "id": "form", "label": "Show login form" },
    { "id": "check", "label": "Credentials valid?", "role": "decision" },
    { "id": "home", "label": "Go to dashboard", "role": "success" },
    { "id": "retry", "label": "Show error", "role": "error" }
  ],
  "edges": [
    { "from": "start", "to": "form" },
    { "from": "form", "to": "check" },
    { "from": "check", "to": "home", "label": "yes" },
    { "from": "check", "to": "retry", "label": "no" },
    { "from": "retry", "to": "form" }
  ]
}
```

- `direction`: `down` (mermaid TD), `right` (LR), `up`, `left`.
- `connector`: `elbow` (default, right-angled) or `arc`.
- `role` sets shape + colour conventionally, so describe meaning not styling:
  `process` (default), `start`, `end`, `decision`, `io`, `data`, `external`,
  `error`, `success`, `note`.
- `replace: true` clears the canvas first — use when redrawing from scratch.
- `rank` pins a node to a specific layer; `spacing` and `origin` override geometry.

Cycles are detected automatically and bowed around the outside of the diagram,
so feedback loops don't cut back through the nodes. Re-running the same node ids
updates in place rather than duplicating, so iterate freely.

## Linking — the rule that matters

Connect shapes **by id**, never by coordinates:

```json
{ "type": "arrow", "from": "login", "to": "dashboard", "text": "on success" }
```

A bound arrow anchors on each shape's edge and re-routes when either end moves.
An arrow built from raw `start`/`end` points just overlaps whatever is in the
way. Use raw points only to point at empty space.

## create_shape vocabulary

| type    | required            | notable options |
|---------|---------------------|-----------------|
| `geo`   | `x, y`              | `w`/`h` (omit to auto-size to `text`), `geo`, `text`, `color`, `fill`, `dash`, `size`, `align` |
| `text`  | `x, y, text`        | `color`, `size` (s/m/l/xl), `font`, `w` to wrap |
| `arrow` | `from`+`to`, or a start and `end` | `text`, `kind` (`elbow`/`arc`), `bend`, `dash`, `arrowheadStart`/`arrowheadEnd` |
| `line`  | `end` or `points`   | `color`, `dash`, `spline` |
| `draw`  | `x, y, points` (≥2) | `color`, `closed` — freehand |
| `note`  | `x, y, text`        | `color` — sticky, fixed size |
| `frame` | `x, y, w, h`        | `name` — titled container for grouping |

Coordinates: origin top-left, `+x` right, `+y` down. Give shapes an `id` so you
can reference them from arrows and later edits.

Colours: `black, grey, light-violet, violet, blue, light-blue, yellow, orange,
green, light-green, light-red, red, white`.
Fills: `none, semi, solid, pattern, fill`. Dashes: `draw, solid, dashed, dotted`.

## Editing

`get_canvas` returns every shape with resolved geometry, its label, and for
arrows the ids each end is bound to. Call it before any edit that refers to
existing content, then use the same field names to change things:

```json
{ "updates": [{ "id": "check", "props": { "color": "red", "text": "Valid?" } }] }
```

`delete_shape({ ids: [...] })` removes shapes; `delete_shape({ all: true })`
clears the canvas. Arrows bound to a deleted shape are removed with it.

## Pitfalls

- Don't hand-place a diagram — that's what `create_diagram` is for.
- `arrow.end` is an absolute point, not a delta, and is ignored when `to` is set.
- `text` shapes need non-empty `text`.
- Split batches larger than 300 shapes.
- `x-box` and `check-box` draw their mark across the whole shape, through any
  label — prefer a coloured rectangle for success/failure states.
