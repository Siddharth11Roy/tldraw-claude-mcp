// End-to-end check against a real browser.
//
// The unit tests stop at the bridge: they prove the server sends the right
// payload, not that tldraw accepts it. Shape props, binding shapes and rich
// text are only validated at runtime by tldraw, so this drives an actual canvas
// and asserts on what comes back.
//
//   npm run test:e2e
//
// Requires Playwright and a Chrome/Chromium. Skips cleanly if either is absent.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..", "packages", "server");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("skip: playwright is not installed (npm i -D playwright)");
  process.exit(0);
}

let startStaticHost, WsBridge, tools;
try {
  ({ startStaticHost } = await import(join(SERVER, "dist/httpHost.js")));
  ({ WsBridge } = await import(join(SERVER, "dist/wsBridge.js")));
  tools = {
    ...(await import(join(SERVER, "dist/tools/diagram.js"))),
    ...(await import(join(SERVER, "dist/tools/create.js"))),
    ...(await import(join(SERVER, "dist/tools/connect.js"))),
    ...(await import(join(SERVER, "dist/tools/update.js"))),
    ...(await import(join(SERVER, "dist/tools/delete.js"))),
    ...(await import(join(SERVER, "dist/tools/getCanvas.js")))
  };
} catch (e) {
  console.error("build the workspace first (npm run build):", e.message);
  process.exit(1);
}

const {
  createDiagram, DiagramInput, createShape, CreateInput,
  connectShapes, ConnectInput, updateShape, UpdateInput,
  deleteShape, DeleteInput, getCanvas
} = tools;

const { server: http, port } = await startStaticHost({
  publicDir: join(SERVER, "public"),
  preferredPort: 3131
});
const bridge = new WsBridge(http, { port, timeoutMs: 30_000 });

let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
} catch {
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    console.log("skip: no Chrome/Chromium available (npx playwright install chromium)");
    bridge.close();
    http.close();
    process.exit(0);
  }
}

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(`http://localhost:${port}`);
for (let i = 0; i < 100 && !bridge.isConnected(); i++) {
  await new Promise((r) => setTimeout(r, 100));
}
if (!bridge.isConnected()) {
  console.error("✗ the browser never connected to the bridge");
  process.exit(1);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const boxesOverlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ------------------------------------------------------------------ diagram
const spec = {
  title: "Login flow",
  direction: "down",
  nodes: [
    { id: "start", label: "Start", role: "start" },
    { id: "form", label: "Show login form" },
    { id: "check", label: "Credentials valid?", role: "decision" },
    { id: "home", label: "Go to dashboard", role: "success" },
    { id: "retry", label: "Show error message", role: "error" },
    { id: "audit", label: "Write audit log", role: "data" }
  ],
  edges: [
    { from: "start", to: "form" },
    { from: "form", to: "check" },
    { from: "check", to: "home", label: "yes" },
    { from: "check", to: "retry", label: "no" },
    { from: "retry", to: "form" },
    { from: "home", to: "audit" }
  ]
};
await createDiagram(bridge, DiagramInput.parse(spec));

let canvas = await getCanvas(bridge);
const geos = canvas.shapes.filter((s) => s.type === "geo");
const arrows = canvas.shapes.filter((s) => s.type === "arrow");

check("every node renders", geos.length === 6, `got ${geos.length}`);
check("every edge renders", arrows.length === 6, `got ${arrows.length}`);
check("every connector is bound at both ends", arrows.every((a) => a.from && a.to));
check("decision node is a diamond", geos.find((g) => g.id === "check")?.geo === "diamond");
check("node labels round-trip", geos.find((g) => g.id === "form")?.text === "Show login form");
check("edge labels round-trip", arrows.some((a) => a.text === "yes"));
check("flow runs downward", geos.find((g) => g.id === "form").y > geos.find((g) => g.id === "start").y);
check(
  "no two nodes overlap",
  geos.every((a) => geos.every((b) => a.id === b.id || !boxesOverlap(a, b)))
);

// A bound arrow must track its node; an unbound one would be left behind.
const arrowBefore = (await getCanvas(bridge)).shapes.find((s) => s.type === "arrow");
await updateShape(bridge, UpdateInput.parse({ updates: [{ id: "form", props: { x: 900 } }] }));
canvas = await getCanvas(bridge);
const arrowAfter = canvas.shapes.find((s) => s.id === arrowBefore.id);
check("update_shape moves a node", canvas.shapes.find((s) => s.id === "form")?.x === 900);
check(
  "bound connectors re-route when a node moves",
  arrowAfter && (arrowAfter.x !== arrowBefore.x || arrowAfter.w !== arrowBefore.w)
);

// -------------------------------------------------------------- every shape
await deleteShape(bridge, DeleteInput.parse({ ids: [], all: true }));
check("delete_shape({all}) empties the canvas", (await getCanvas(bridge)).count === 0);

await createShape(
  bridge,
  CreateInput.parse({
    shapes: [
      { type: "geo", id: "box", x: 100, y: 100, w: 160, h: 90, text: "Box", color: "blue", fill: "semi", dash: "dashed" },
      { type: "text", x: 100, y: 40, text: "Heading", size: "l" },
      { type: "line", x: 400, y: 100, points: [{ x: 400, y: 100 }, { x: 500, y: 160 }, { x: 600, y: 100 }] },
      { type: "draw", x: 400, y: 300, points: [{ x: 400, y: 300 }, { x: 450, y: 350 }, { x: 500, y: 300 }] },
      { type: "note", id: "sticky", x: 700, y: 100, text: "Remember", color: "yellow" },
      { type: "frame", x: 100, y: 450, w: 400, h: 220, name: "Phase 1" },
      { type: "arrow", x: 300, y: 250, end: { x: 460, y: 250 }, text: "free" }
    ]
  })
);
canvas = await getCanvas(bridge);
const types = canvas.shapes.map((s) => s.type);
check(
  "all seven shape kinds render",
  ["arrow", "draw", "frame", "geo", "line", "note", "text"].every((t) => types.includes(t)),
  types.join(",")
);
check("sticky text round-trips", canvas.shapes.find((s) => s.id === "sticky")?.text === "Remember");
check("unbound arrow keeps its label", canvas.shapes.some((s) => s.type === "arrow" && s.text === "free"));

// ----------------------------------------------------------- connect_shapes
await connectShapes(
  bridge,
  ConnectInput.parse({ connections: [{ from: "box", to: "sticky", text: "linked" }] })
);
canvas = await getCanvas(bridge);
check(
  "connect_shapes binds two existing shapes",
  canvas.shapes.some((s) => s.type === "arrow" && s.from === "box" && s.to === "sticky")
);
const bad = await connectShapes(
  bridge,
  ConnectInput.parse({ connections: [{ from: "box", to: "does-not-exist" }] })
);
check("connect_shapes reports a missing endpoint", bad.missing.length === 1);

// -------------------------------------------------------------- idempotency
await deleteShape(bridge, DeleteInput.parse({ ids: [], all: true }));
const small = { nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }] };
await createDiagram(bridge, DiagramInput.parse(small));
await createDiagram(bridge, DiagramInput.parse(small));
check(
  "redrawing a diagram updates in place instead of duplicating",
  (await getCanvas(bridge)).count === 3,
  `count=${(await getCanvas(bridge)).count}`
);

check("no browser console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

await browser.close();
bridge.close();
http.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
