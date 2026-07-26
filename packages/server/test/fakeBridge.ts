import { Bridge, BridgeOp, BridgeReply, BridgeTimeoutError } from "../src/bridge.js";

export interface FakeBridgeOptions {
  connected?: boolean;
  reply?: (op: BridgeOp) => BridgeReply | Promise<BridgeReply>;
  timeoutMs?: number;
  hang?: boolean;
}

export class FakeBridge implements Bridge {
  public sent: BridgeOp[] = [];
  private opts: FakeBridgeOptions;

  constructor(opts: FakeBridgeOptions = {}) {
    this.opts = { connected: true, ...opts };
  }

  isConnected(): boolean {
    return this.opts.connected !== false;
  }

  canvasUrl(): string {
    return "http://localhost:3030";
  }

  async send(op: BridgeOp): Promise<BridgeReply> {
    this.sent.push(op);
    if (this.opts.hang) {
      const ms = this.opts.timeoutMs ?? 50;
      await new Promise((r) => setTimeout(r, ms));
      throw new BridgeTimeoutError(ms);
    }
    if (this.opts.reply) return this.opts.reply(op);
    return { op: "ack", msgId: op.msgId, ok: true, ids: ["auto"], count: 1 };
  }

  /** Ops of a given kind — lets assertions ignore the cosmetic trailing `fit`. */
  opsOfType<T extends BridgeOp["op"]>(type: T): Extract<BridgeOp, { op: T }>[] {
    return this.sent.filter((o) => o.op === type) as Extract<BridgeOp, { op: T }>[];
  }
}
