import { createServer, Server, IncomingMessage, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

export interface HostOptions {
  publicDir: string;
  preferredPort: number;
  maxPortAttempts?: number;
}

export interface HostResult {
  server: Server;
  port: number;
}

export async function startStaticHost(opts: HostOptions): Promise<HostResult> {
  const root = normalize(opts.publicDir);
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const safe = normalize(urlPath).replace(/^([\\/])+/, "");
      let filePath = join(root, safe);
      if (!filePath.startsWith(root)) {
        res.statusCode = 403; res.end("Forbidden"); return;
      }
      let s;
      try { s = await stat(filePath); } catch { s = null; }
      if (s && s.isDirectory()) filePath = join(filePath, "index.html");
      let body: Buffer;
      try {
        body = await readFile(filePath);
      } catch {
        // SPA fallback
        body = await readFile(join(root, "index.html"));
        filePath = join(root, "index.html");
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream");
      res.end(body);
    } catch (err) {
      res.statusCode = 500;
      res.end("Internal error");
    }
  };

  const server = createServer(handler);
  const port = await listenWithFallback(server, opts.preferredPort, opts.maxPortAttempts ?? 10);
  return { server, port };
}

function listenWithFallback(server: Server, start: number, attempts: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let current = start;
    let tries = 0;
    const tryListen = () => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && tries < attempts) {
          tries++; current++; tryListen();
        } else {
          reject(err);
        }
      });
      server.listen(current, "127.0.0.1", () => resolve(current));
    };
    tryListen();
  });
}

export function defaultPublicDir(): string {
  return fileURLToPath(new URL("../public", import.meta.url));
}
