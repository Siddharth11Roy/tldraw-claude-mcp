import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  ColorEnum, DashEnum, SizeEnum, FontEnum, ArrowKindEnum, ArrowheadEnum, MAX_SHAPES_PER_CALL
} from "../shapes.js";
import { Bridge, NoBrowserError, expectAck, type Connection } from "../bridge.js";

const ConnectionInput = z.object({
  from: z.string().min(1).describe("Id of the shape the connector starts at."),
  to: z.string().min(1).describe("Id of the shape the connector points at."),
  id: z.string().min(1).optional().describe("Id for the connector itself."),
  text: z.string().optional().describe("Label on the connector."),
  kind: ArrowKindEnum.default("elbow"),
  color: ColorEnum.optional(),
  labelColor: ColorEnum.optional(),
  dash: DashEnum.optional(),
  size: SizeEnum.default("s"),
  font: FontEnum.optional(),
  bend: z.number().optional().describe("Curve amount in px; `arc` connectors only."),
  arrowheadStart: ArrowheadEnum.default("none"),
  arrowheadEnd: ArrowheadEnum.default("arrow")
});

export const ConnectInput = z.object({
  connections: z.array(ConnectionInput).min(1).max(MAX_SHAPES_PER_CALL)
});
export type ConnectInput = z.infer<typeof ConnectInput>;

export interface ConnectResult {
  connected: number;
  ids: string[];
  /** Connections skipped because an endpoint was not on the canvas. */
  missing: string[];
}

/**
 * Draw bound connectors between shapes that already exist. Because both
 * terminals are bound, the arrows anchor on each shape's edge and re-route when
 * either end is moved — unlike an arrow drawn from raw coordinates.
 */
export async function connectShapes(
  bridge: Bridge,
  input: ConnectInput
): Promise<ConnectResult> {
  if (!bridge.isConnected()) throw new NoBrowserError(bridge.canvasUrl());

  const reply = await bridge.send({
    op: "connect",
    msgId: randomUUID(),
    connections: input.connections as Connection[]
  });
  const { ids, count, missing } = expectAck(reply);
  return { connected: count, ids, missing };
}
