// WS protocol on the browser side. Reconnects with backoff.

export type ServerOp =
  | { op: "hello"; protocol: number }
  | { op: "create"; msgId: string; shapes: unknown[] }
  | { op: "update"; msgId: string; updates: { id: string; props: Record<string, unknown> }[] }
  | { op: "delete"; msgId: string; ids: string[] }
  | { op: "query"; msgId: string };

export type ClientReply =
  | { op: "ack"; msgId: string; ok: true; ids?: string[] }
  | { op: "ack"; msgId: string; ok: false; message: string }
  | { op: "state"; msgId: string; shapes: unknown[] };

export interface BridgeClientHandlers {
  onCreate: (shapes: unknown[]) => string[];
  onUpdate: (updates: { id: string; props: Record<string, unknown> }[]) => void;
  onDelete: (ids: string[]) => void;
  onQuery: () => unknown[];
}

export class BridgeClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: BridgeClientHandlers;
  private retry = 0;

  constructor(url: string, handlers: BridgeClientHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  start() {
    this.connect();
  }

  private connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; };
    ws.onmessage = (ev) => this.handle(ev.data);
    ws.onclose = () => {
      const delay = Math.min(30_000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private handle(data: string) {
    let msg: ServerOp;
    try { msg = JSON.parse(data); } catch { return; }
    switch (msg.op) {
      case "hello": return;
      case "create": {
        try {
          const ids = this.handlers.onCreate(msg.shapes);
          this.reply({ op: "ack", msgId: msg.msgId, ok: true, ids });
        } catch (e) {
          this.reply({ op: "ack", msgId: msg.msgId, ok: false, message: errMsg(e) });
        }
        return;
      }
      case "update": {
        try {
          this.handlers.onUpdate(msg.updates);
          this.reply({ op: "ack", msgId: msg.msgId, ok: true });
        } catch (e) {
          this.reply({ op: "ack", msgId: msg.msgId, ok: false, message: errMsg(e) });
        }
        return;
      }
      case "delete": {
        try {
          this.handlers.onDelete(msg.ids);
          this.reply({ op: "ack", msgId: msg.msgId, ok: true });
        } catch (e) {
          this.reply({ op: "ack", msgId: msg.msgId, ok: false, message: errMsg(e) });
        }
        return;
      }
      case "query": {
        const shapes = this.handlers.onQuery();
        this.reply({ op: "state", msgId: msg.msgId, shapes });
        return;
      }
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
