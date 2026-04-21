# tl-draw-mcp

MCP server + Claude Code skill that lets Claude draw on a live [tldraw](https://tldraw.dev) canvas from prompts.

- Open `http://localhost:3030` in any browser → Claude's drawings appear in real time.
- Four tools: `create_shape`, `update_shape`, `delete_shape`, `get_canvas`.
- Pure-JS, MIT, Windows-first.

---

## 1. Install

```cmd
git clone <this repo> tl-draw-mcp
cd tl-draw-mcp
npm install
cd packages\web    && npm run build
cd ..\server       && npm run build
```

---

## 2. Wire it into Claude Code

One-liner (recommended — no JSON editing):

```cmd
claude mcp add tldraw --scope user -- cmd /c node "D:/path/to/tl-draw-mcp/packages/server/dist/index.js"
```

Verify:

```cmd
claude mcp list
```

You should see `tldraw` listed. Restart Claude Code.

---

## 3. Install the skill

Copy the skill folder so Claude knows when to draw:

```cmd
xcopy /E /I .claude\skills\tldraw %USERPROFILE%\.claude\skills\tldraw
```

---

## 4. Use

1. Start Claude Code in any project.
2. First tool call will spin up the server — open `http://localhost:3030`.
3. Badge at the bottom-right reads `tldraw MCP · connected`.
4. Prompt:
   > *Draw a flowchart of a login flow.*

---

## 5. Develop

```cmd
cd packages\server && npm test           :: 12 handler tests
cd packages\server && npm run dev        :: stdio + WS bridge on :3030
cd packages\web    && npm run dev        :: Vite HMR on :5173
```

---

## 6. Layout

```
packages/server   MCP stdio server, WS bridge, static host, tool handlers
packages/web      Vite + React + tldraw browser app (builds into server/public)
.claude/skills/   SKILL.md for Claude Code
examples/         sample MCP config (if you prefer JSON over the CLI)
```

---

## 7. Troubleshooting

| Symptom                                             | Fix                                                                                     |
|-----------------------------------------------------|-----------------------------------------------------------------------------------------|
| Badge says `connected` but Claude says "no browser" | Stale server on :3030. `taskkill /F /IM node.exe`, close tabs, restart Claude Code.     |
| Tldraw validation error in browser                  | Clear IndexedDB (F12 → Application → IndexedDB → delete `TLDRAW_*`), hard refresh.      |
| Port :3030 busy                                     | Server auto-falls-back to :3031 etc. Check MCP logs via `/mcp` for the real URL.        |
| `npm install` peer-dep error                        | Retry with `npm install --legacy-peer-deps`.                                            |

---

See `plan.md` for design notes and `LICENSE` for MIT terms.
