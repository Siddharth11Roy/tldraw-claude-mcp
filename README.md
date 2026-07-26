# tl-draw-mcp

An MCP server that draws on a live [tldraw](https://tldraw.dev) canvas from
prompts. Works with **Claude Code**, **Codex**, and any other MCP client.

Open `http://localhost:3030` in a browser and the agent's diagrams appear in
real time.

**`create_diagram` is the point.** Describe a graph — nodes, edges, a direction —
and the server measures every label, assigns layers, minimises edge crossings
and binds the connectors to the nodes. It replaces reaching for mermaid, and
unlike hand-placed coordinates the result is actually laid out.

---

## 1. Install

```sh
git clone <this repo> tl-draw-mcp
cd tl-draw-mcp
npm install
npm run build          # builds the web canvas, then the server
```

If npm reports a peer-dependency conflict, retry with
`npm install --legacy-peer-deps`.

## 2. Wire it up

### Claude Code

```sh
claude mcp add tldraw --scope user -- node /absolute/path/to/tl-draw-mcp/packages/server/dist/index.js
```

On Windows, use forward slashes in the path (or `cmd /c node "D:/..."`).
Verify with `claude mcp list`, then restart Claude Code.

Install the skill so Claude knows when to draw:

```sh
# macOS / Linux
mkdir -p ~/.claude/skills && cp -r .claude/skills/tldraw ~/.claude/skills/

# Windows
xcopy /E /I .claude\skills\tldraw %USERPROFILE%\.claude\skills\tldraw
```

### Codex

```sh
codex mcp add tldraw -- node /absolute/path/to/tl-draw-mcp/packages/server/dist/index.js
```

Or add it to `~/.codex/config.toml` by hand — see
[`examples/codex-config.toml`](examples/codex-config.toml):

```toml
[mcp_servers.tldraw]
command = "node"
args = ["/absolute/path/to/tl-draw-mcp/packages/server/dist/index.js"]
```

Codex has no skill mechanism, so the usage rules ship in the server's MCP
`instructions` and in every tool description. For stronger steering, paste the
short block at the end of [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md) into your
`AGENTS.md`.

### Any other MCP client

It's a plain stdio MCP server:
`node /path/to/tl-draw-mcp/packages/server/dist/index.js`.
See [`examples/claude-code-config.json`](examples/claude-code-config.json) for
the JSON form.

## 3. Use

1. Start your agent in any project.
2. The first tool call spins up the server — open `http://localhost:3030`.
3. The badge at the bottom-right reads `tldraw MCP · connected`.
4. Prompt: *"Draw a flowchart of the login flow."*

---

## Tools

| Tool | What it does |
|---|---|
| `create_diagram` | Node-and-edge diagram with automatic layout. **Use this for any graph.** |
| `create_shape` | Shapes at explicit positions — free-form drawing, wireframes, annotation. |
| `connect_shapes` | Bound connectors between shapes that already exist. |
| `update_shape` | Change position, size, colour or text by id. |
| `delete_shape` | Remove shapes by id, or `{ all: true }` to clear. |
| `get_canvas` | Everything on the canvas, including how arrows are wired. |

### create_diagram

```jsonc
{
  "title": "Login flow",
  "direction": "down",        // down = mermaid TD, right = LR, also up / left
  "connector": "elbow",       // right-angled; "arc" for curved
  "nodes": [
    { "id": "start", "label": "Start", "role": "start" },
    { "id": "check", "label": "Credentials valid?", "role": "decision" },
    { "id": "home",  "label": "Go to dashboard", "role": "success" }
  ],
  "edges": [
    { "from": "start", "to": "check" },
    { "from": "check", "to": "home", "label": "yes" }
  ]
}
```

- **Roles** map meaning to conventional styling: `process`, `start`, `end`,
  `decision`, `io`, `data`, `external`, `error`, `success`, `note`.
- Nodes are **sized to their label**; no more text spilling out of boxes.
- Cycles are detected and **bowed around the outside**, so feedback loops don't
  cut back through the diagram.
- Re-running with the same node ids **updates in place** instead of duplicating.

### Shape vocabulary

`geo`, `text`, `arrow`, `line`, `draw`, `note`, `frame`.

Link shapes by id, never by coordinates:

```jsonc
{ "type": "arrow", "from": "login", "to": "dashboard", "text": "on success" }
```

Bound arrows anchor on each shape's edge and re-route when either end moves.

Full reference: [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md).

---

## Develop

```sh
npm test                                   # 59 unit tests
npm run test:e2e                           # drives a real browser (needs playwright)
npm run dev                                # stdio server + WS bridge on :3030
npm run dev --workspace @tldraw-mcp/web    # Vite HMR on :5173
```

The unit tests stop at the bridge — they prove the server sends the right
payload, not that tldraw accepts it. Shape props, bindings and rich text are
only validated by tldraw at runtime, so `test:e2e` drives an actual canvas in
Chrome and asserts on what comes back. It skips cleanly if Playwright isn't
installed (`npm i -D playwright`).

### Layout

`packages/server/src/layout.ts` is a self-contained layered (Sugiyama-style)
layout: break cycles → rank by longest path → reduce crossings with barycentre
sweeps → assign coordinates with neighbour-pull and overlap separation. Pure
functions, no tldraw types, so it's cheap to test.

`packages/server/src/textMetrics.ts` estimates label sizes from tldraw's own
font constants — layout has to happen before any shape exists, so node sizes
can't be measured in the browser.

## Layout

```
packages/server   MCP stdio server, WS bridge, static host, layout, tool handlers
packages/web      Vite + React + tldraw browser app (builds into server/public)
.claude/skills/   SKILL.md for Claude Code
docs/             portable agent guide (Codex and other MCP clients)
e2e/              browser-driven end-to-end checks
examples/         MCP config for Claude Code and Codex
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `TLDRAW_MCP_PORT` | `3030` | Preferred port; falls back to 3031, 3032, … if taken. |
| `TLDRAW_MCP_TIMEOUT_MS` | `20000` | How long to wait for the browser to apply a batch. |

## Troubleshooting

| Symptom | Fix |
|---|---|
| Agent says no canvas is connected | Open the URL from the error message. If a stale server holds :3030, the new one moves to :3031 — check the URL in the error. |
| tldraw validation error in the browser | Clear IndexedDB (DevTools → Application → IndexedDB → delete `TLDRAW_*`) and hard-refresh. |
| Badge says `connected` but nothing draws | Protocol mismatch after an upgrade — rebuild (`npm run build`) and hard-refresh the tab. The browser console names the versions. |
| Port :3030 busy | Automatic fallback to :3031 etc. The real URL is in the MCP logs (`/mcp` in Claude Code) and in every error message. |
| `npm install` peer-dep error | Retry with `npm install --legacy-peer-deps`. |

---

MIT — see [`LICENSE`](LICENSE).
