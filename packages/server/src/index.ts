#!/usr/bin/env node
import { startStaticHost, defaultPublicDir } from "./httpHost.js";
import { WsBridge } from "./wsBridge.js";
import { createMcpServer, connectStdio } from "./mcp.js";

const PREFERRED_PORT = Number(process.env.TLDRAW_MCP_PORT ?? 3030);

async function main() {
  const { server: http, port } = await startStaticHost({
    publicDir: defaultPublicDir(),
    preferredPort: PREFERRED_PORT
  });
  const bridge = new WsBridge(http);
  const mcp = createMcpServer(bridge);

  // MCP forbids stdout noise — log to stderr only.
  process.stderr.write(`[tldraw-mcp] canvas: http://localhost:${port}\n`);

  const shutdown = () => {
    bridge.close();
    http.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await connectStdio(mcp);
}

main().catch((err) => {
  process.stderr.write(`[tldraw-mcp] fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
