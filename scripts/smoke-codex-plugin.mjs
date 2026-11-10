// Smoke test for the Codex plugin as Codex will actually run it.
//
// Copies plugins/tldraw to a temp directory (no node_modules anywhere above
// it), launches the MCP command from .mcp.json with the plugin root as cwd,
// and checks the things bundling can break:
//
//   - MCP handshake: initialize, server instructions, all six tools listed
//   - the canvas is served over HTTP from the plugin's own public/
//   - the WebSocket bridge accepts a browser and says hello
//   - a tool call with no browser attached fails with the "open <url>" hint
//
//   npm run test:plugin
//   node scripts/smoke-codex-plugin.mjs <dir>   # test an installed copy, e.g.
//                                               # ~/.codex/plugins/cache/tldraw-mcp/tldraw/<version>

import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "plugins", "tldraw");
const EXPECTED_TOOLS = [
  "connect_shapes", "create_diagram", "create_shape",
  "delete_shape", "get_canvas", "update_shape"
];

const tmp = await mkdtemp(join(tmpdir(), "tldraw-plugin-smoke-"));
const root = join(tmp, "tldraw");
await cp(PLUGIN, root, { recursive: true });

const { mcpServers } = JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"));
const spec = mcpServers.tldraw;
const child = spawn(spec.command, spec.args, {
  cwd: join(root, spec.cwd ?? "."),
  // A minimal env, like Codex gives MCP servers. Use an unlikely port so the
  // test doesn't collide with a canvas already running on 3030.
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TLDRAW_MCP_PORT: "3973" },
  stdio: ["pipe", "pipe", "pipe"]
});

let stderr = "";
child.stderr.on("data", (d) => (stderr += d));

const replies = new Map();
let buf = "";
child.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch {
      fail(`non-JSON on stdout (corrupts the MCP stream): ${line.slice(0, 200)}`);
    }
    if (msg.id !== undefined) replies.get(msg.id)?.(msg);
  }
});

let nextId = 1;
function rpc(method, params = {}) {
  const id = nextId++;
  return withTimeout(new Promise((resolve) => {
    replies.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  }), `${method} reply`);
}

let failed = false;
function fail(msg) {
  failed = true;
  console.error(`FAIL ${msg}`);
  if (stderr) console.error(`--- server stderr ---\n${stderr}`);
  cleanup(1);
}
function pass(msg) { console.log(`ok   ${msg}`); }

function withTimeout(p, what, ms = 10_000) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out waiting for ${what}`)), ms))
  ]);
}

async function cleanup(code) {
  child.kill("SIGTERM");
  await rm(tmp, { recursive: true, force: true });
  process.exit(code);
}

try {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0" }
  });
  if (init.error) fail(`initialize: ${JSON.stringify(init.error)}`);
  const { serverInfo, instructions } = init.result;
  if (serverInfo?.name !== "tldraw-mcp") fail(`serverInfo.name = ${serverInfo?.name}`);
  if (!instructions?.includes("create_diagram")) fail("server instructions missing");
  pass(`initialize → ${serverInfo.name} ${serverInfo.version}`);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const list = await rpc("tools/list");
  const names = list.result.tools.map((t) => t.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) fail(`tools = ${names}`);
  for (const t of list.result.tools) {
    if (t.inputSchema?.type !== "object") fail(`${t.name} has no object inputSchema`);
  }
  pass(`tools/list → ${names.join(", ")}`);

  const url = stderr.match(/canvas: (http:\/\/localhost:\d+)/)?.[1];
  if (!url) fail("server never logged its canvas URL");

  const noCanvas = await rpc("tools/call", { name: "get_canvas", arguments: {} });
  const text = noCanvas.result?.content?.[0]?.text ?? "";
  if (!noCanvas.result?.isError || !text.includes(url)) {
    fail(`get_canvas without a browser should point at ${url}, got: ${text}`);
  }
  pass("tool call without a browser → asks the user to open the canvas URL");

  const html = await (await fetch(url)).text();
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  if (!script) fail("canvas index.html has no script tag");
  const js = await fetch(url + script);
  if (!js.ok || !(js.headers.get("content-type") ?? "").includes("javascript")) {
    fail(`${script} → ${js.status} ${js.headers.get("content-type")}`);
  }
  pass(`canvas served at ${url} (index.html + ${script})`);

  const hello = await withTimeout(new Promise((resolve, reject) => {
    const ws = new WebSocket(url.replace("http", "ws") + "/ws");
    ws.on("message", (d) => { resolve(JSON.parse(d.toString())); ws.close(); });
    ws.on("error", reject);
  }), "WebSocket hello");
  if (hello.op !== "hello" || typeof hello.protocol !== "number") {
    fail(`unexpected WebSocket greeting: ${JSON.stringify(hello)}`);
  }
  pass(`WebSocket bridge → hello, protocol v${hello.protocol}`);
} catch (e) {
  fail(e.message);
}

if (!failed) {
  console.log("plugin smoke test passed");
  await cleanup(0);
}
