// WS protocol on the browser side. Reconnects with backoff.

export type ServerOp =
  | { op: "hello"; protocol: number }
  | { op: "create"; msgId: string; shapes: unknown[] }
  | { op: "connect"; msgId: string; connections: unknown[] }
  | { op: "update"; msgId: string; updates: { id: string; props: Record<string, unknown> }[] }
  | { op: "delete"; msgId: string; ids: string[] }
  | { op: "clear"; msgId: string }
  | { op: "fit"; msgId: string }
  | { op: "query"; msgId: string };

export type ClientReply =
  | { op: "ack"; msgId: string; ok: true; ids?: string[]; count?: number; missing?: string[] }
  | { op: "ack"; msgId: string; ok: false; message: string }
  | {
      op: "state";
      msgId: string;
      shapes: unknown[];
      bounds?: { x: number; y: number; w: number; h: number };
    };

export interface BridgeClientHandlers {
  onCreate: (shapes: unknown[]) => string[];
  onConnect: (connections: unknown[]) => { ids: string[]; missing: string[] };
  onUpdate: (updates: { id: string; props: Record<string, unknown> }[]) => {
    updated: number;
    missing: string[];
  };
  onDelete: (ids: string[]) => number;
  onClear: () => number;
  onFit: () => void;
  onQuery: () => { shapes: unknown[]; bounds?: { x: number; y: number; w: number; h: number } };
  onActivity?: () => void;
}

/** Protocol the browser understands; the server announces its own on connect. */
export const CLIENT_PROTOCOL = 2;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: BridgeClientHandlers;
  private retry = 0;
  private closed = false;

  constructor(url: string, handlers: BridgeClientHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  start() {
    this.connect();
  }

  stop() {
    this.closed = true;
    this.ws?.close();
  }

  private connect() {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
    };
    ws.onmessage = (ev) => this.handle(ev.data);
    ws.onclose = () => {
      if (this.closed) return;
      const delay = Math.min(30_000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private handle(data: string) {
    let msg: ServerOp;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.op === "hello") {
      if (msg.protocol !== CLIENT_PROTOCOL) {
        console.warn(
          `[tldraw-mcp] protocol mismatch: server speaks v${msg.protocol}, this page speaks ` +
            `v${CLIENT_PROTOCOL}. Rebuild the web package or hard-refresh the tab.`
        );
      }
      return;
    }

    this.handlers.onActivity?.();

    // Every op resolves to a single reply; failures come back as ok:false so
    // the model gets a message it can act on rather than a bridge timeout.
    try {
      switch (msg.op) {
        case "create": {
          const ids = this.handlers.onCreate(msg.shapes);
          return this.reply({ op: "ack", msgId: msg.msgId, ok: true, ids, count: ids.length });
        }
        case "connect": {
          const { ids, missing } = this.handlers.onConnect(msg.connections);
          return this.reply({
            op: "ack", msgId: msg.msgId, ok: true, ids, count: ids.length, missing
          });
        }
        case "update": {
          const { updated, missing } = this.handlers.onUpdate(msg.updates);
          return this.reply({ op: "ack", msgId: msg.msgId, ok: true, count: updated, missing });
        }
        case "delete": {
          const count = this.handlers.onDelete(msg.ids);
          return this.reply({ op: "ack", msgId: msg.msgId, ok: true, count });
        }
        case "clear": {
          const count = this.handlers.onClear();
          return this.reply({ op: "ack", msgId: msg.msgId, ok: true, count });
        }
        case "fit": {
          this.handlers.onFit();
          return this.reply({ op: "ack", msgId: msg.msgId, ok: true });
        }
        case "query": {
          const { shapes, bounds } = this.handlers.onQuery();
          return this.reply({ op: "state", msgId: msg.msgId, shapes, bounds });
        }
      }
    } catch (e) {
      this.reply({ op: "ack", msgId: (msg as { msgId: string }).msgId, ok: false, message: errMsg(e) });
    }
  }

  private reply(r: ClientReply) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(r));
    }
  }
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
