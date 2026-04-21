---
name: tldraw
description: Draw, diagram, sketch, wireframe, mind-map, or flowchart on a live tldraw canvas via the tldraw-mcp server. Use whenever the user asks to visualize, draw, sketch, diagram, or lay out something graphically.
---

# tldraw skill

You can draw on a live tldraw canvas through the `tldraw-mcp` MCP server. The user sees your output appear in real time at `http://localhost:3030`.

## Before drawing

If you have not yet drawn this session, tell the user once:

> Open `http://localhost:3030` in your browser to see the canvas.

If a tool returns `No tldraw browser connected`, repeat that hint.

## Tools

- `create_shape({ shapes: [...] })` — add new shapes.
- `update_shape({ updates: [{ id, props }] })` — change shapes by id.
- `delete_shape({ ids: [...] })` — remove shapes.
- `get_canvas()` — return all current shapes. Call this first whenever the user says "add to", "next to", "modify", or refers to something already on the canvas.

## Coordinate system

- Origin `(0, 0)` is top-left. `+x` is right, `+y` is down.
- Aim within `0 ≤ x ≤ 1600`, `0 ≤ y ≤ 900` unless asked otherwise.
- Sizes (`w`, `h`) in pixels. Default to ~120×80 for boxes, ~60×60 for icons.

## Shape vocabulary

| type   | required               | optional                                    |
|--------|------------------------|---------------------------------------------|
| `geo`  | `x, y, w, h`           | `geo` (rectangle/ellipse/triangle/diamond/star/...), `color`, `fill`, `text` |
| `text` | `x, y, text`           | `color`, `size` (s/m/l/xl)                  |
| `arrow`| `x, y, end:{x,y}`      | `color`, `text` (label)                     |
| `line` | `x, y, end:{x,y}`      | `color`                                     |
| `draw` | `x, y, points:[{x,y}]` | `color` — freehand, ≥2 points               |
| `note` | `x, y, text`           | `color` — sticky note                       |

Colors: `black, grey, light-violet, violet, blue, light-blue, yellow, orange, green, light-green, red`.
Fills: `none, semi, solid, pattern`.

## Patterns

**Flowchart node + arrow:**
```json
{ "shapes": [
  { "type": "geo", "geo": "rectangle", "x": 100, "y": 100, "w": 160, "h": 80, "text": "Start", "color": "blue" },
  { "type": "geo", "geo": "rectangle", "x": 400, "y": 100, "w": 160, "h": 80, "text": "End", "color": "green" },
  { "type": "arrow", "x": 260, "y": 140, "end": { "x": 400, "y": 140 } }
] }
```

**Sticky note cluster:** use `note`, space them ~220px apart horizontally.

## Pitfalls

- `text` shapes must include `text` (non-empty).
- `arrow.end` is an absolute point, not a delta.
- Don't send more than 200 shapes in one `create_shape` call — split into batches.
- For edits, always call `get_canvas` first to discover the real shape ids.
