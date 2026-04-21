import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";
import { Bridge, BridgeOp, BridgeReply, BridgeTimeoutError } from "./bridge.js";

const PROTOCOL_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 5000;

interface Pending {
  resolve: (r: BridgeReply) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

export class WsBridge implements Bridge {
  private wss: WebSocketServer;
  private client: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private timeoutMs: number;

  constructor(server: HttpServer, opts: { timeoutMs?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (ws) => this.handleClient(ws));
  }

  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  send(op: BridgeOp): Promise<BridgeReply> {
    if (!this.isConnected() || !this.client) {
      return Promise.reject(new Error("Bridge not connected."));
    }
    const ws = this.client;
    return new Promise<BridgeReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(op.msgId);
        reject(new BridgeTimeoutError(this.timeoutMs));
      }, this.timeoutMs);
      this.pending.set(op.msgId, { resolve, reject, timer });
      ws.send(JSON.stringify(op), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(op.msgId);
          reject(err);
        }
      });
    });
  }

  close(): void {
    for (const [, p] of this.pending) clearTimeout(p.timer);
    this.pending.clear();
    this.wss.close();
  }

  private handleClient(ws: WebSocket) {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.client.close(1000, "Replaced by new connection");
    }
    this.client = ws;
    ws.send(JSON.stringify({ op: "hello", protocol: PROTOCOL_VERSION }));

    ws.on("message", (raw) => {
      let msg: BridgeReply | { op: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if ((msg as BridgeReply).op === "ack" || (msg as BridgeReply).op === "state") {
        const reply = msg as BridgeReply;
        const p = this.pending.get(reply.msgId);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(reply.msgId);
        p.resolve(reply);
      }
    });

    ws.on("close", () => {
      if (this.client === ws) this.client = null;
    });
  }
}
