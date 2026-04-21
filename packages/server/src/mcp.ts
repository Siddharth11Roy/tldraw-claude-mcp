import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Bridge } from "./bridge.js";
import { createShape, CreateInput, updateShape, UpdateInput, deleteShape, DeleteInput, getCanvas } from "./tools/index.js";
import { Shape, ShapeUpdate } from "./shapes.js";
import { zodToJsonSchema } from "./jsonSchema.js";

export function createMcpServer(bridge: Bridge): Server {
  const server = new Server(
    { name: "tldraw-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "create_shape",
        description: "Create one or more shapes on the tldraw canvas. Supports geo, text, arrow, line, draw, note.",
        inputSchema: zodToJsonSchema(CreateInput)
      },
      {
        name: "update_shape",
        description: "Update existing shapes by id. Provide partial props to change.",
        inputSchema: zodToJsonSchema(UpdateInput)
      },
      {
        name: "delete_shape",
        description: "Delete shapes by id.",
        inputSchema: zodToJsonSchema(DeleteInput)
      },
      {
        name: "get_canvas",
        description: "Return all shapes currently on the canvas. Call this before edits to know what's there.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    try {
      switch (name) {
        case "create_shape": {
          const parsed = CreateInput.parse(args);
          const result = await createShape(bridge, parsed);
          return ok(result);
        }
        case "update_shape": {
          const parsed = UpdateInput.parse(args);
          const result = await updateShape(bridge, parsed);
          return ok(result);
        }
        case "delete_shape": {
          const parsed = DeleteInput.parse(args);
          const result = await deleteShape(bridge, parsed);
          return ok(result);
        }
        case "get_canvas": {
          const result = await getCanvas(bridge);
          return ok(result);
        }
        default:
          return err(`Unknown tool: ${name}`);
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  });

  return server;
}

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function err(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

export async function connectStdio(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
