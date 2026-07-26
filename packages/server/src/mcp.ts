import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Bridge } from "./bridge.js";
import {
  createShape, CreateInput,
  updateShape, UpdateInput,
  deleteShape, DeleteInput,
  connectShapes, ConnectInput,
  createDiagram, DiagramInput,
  getCanvas
} from "./tools/index.js";
import { zodToJsonSchema, EMPTY_SCHEMA } from "./jsonSchema.js";

/**
 * Server-level instructions. Claude Code has the bundled skill, but Codex and
 * other MCP clients have no equivalent — for them this text plus the tool
 * descriptions are the entire briefing, so the important rules live here.
 */
export const INSTRUCTIONS = `Draws on a live tldraw canvas that the user watches in a browser.

Choosing a tool:
- Any node-and-edge diagram — flowchart, architecture, state machine, sequence,
  org chart, dependency graph, mind map — use \`create_diagram\`. Describe the
  graph; the server measures labels, assigns layers, minimises crossings and
  binds the connectors. Do NOT compute x/y yourself for these.
- Free-form drawing, annotations, wireframes or adding to an existing sketch —
  use \`create_shape\`.
- \`create_diagram\` replaces reaching for mermaid: it takes the same
  nodes-and-edges description and renders it natively.

Linking rules (these are what make a diagram read correctly):
- Connect shapes with \`from\`/\`to\` shape ids, never by guessing coordinates.
  Bound arrows anchor on each shape's edge and follow the shape when it moves.
- An arrow with raw \`start\`/\`end\` points is only for pointing at empty space.

Before editing something already drawn, call \`get_canvas\` to read the real ids.`;

export function createMcpServer(bridge: Bridge): Server {
  const server = new Server(
    { name: "tldraw-mcp", version: "0.2.0" },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "create_diagram",
        description:
          "Render a node-and-edge diagram with automatic layout. Give it nodes (with labels and " +
          "semantic roles) and edges; it sizes each node to its text, arranges them into layers in " +
          "the requested direction, reduces edge crossings, and draws connectors bound to the nodes. " +
          "Use this for any flowchart, architecture diagram, state machine, org chart, dependency " +
          "graph or sequence — it is the direct replacement for writing mermaid. Never pre-compute " +
          "coordinates for it.",
        inputSchema: zodToJsonSchema(DiagramInput)
      },
      {
        name: "create_shape",
        description:
          "Create shapes at explicit positions: geo (rectangle, ellipse, diamond, ...), text, arrow, " +
          "line, draw (freehand), note (sticky) and frame (titled container). Use for free-form " +
          "drawing, annotation and wireframes. To link two shapes, give the arrow `from` and `to` " +
          "shape ids rather than coordinates — that binds it so it anchors on their edges and " +
          "follows them. Prefer create_diagram when the content is really a graph.",
        inputSchema: zodToJsonSchema(CreateInput)
      },
      {
        name: "connect_shapes",
        description:
          "Draw bound connectors between shapes that already exist, by id. Use this to add links to " +
          "a diagram without redrawing it. Connectors anchor on shape edges and re-route when either " +
          "end moves.",
        inputSchema: zodToJsonSchema(ConnectInput)
      },
      {
        name: "update_shape",
        description:
          "Change existing shapes by id — position, size, colour, text, or any other style. Call " +
          "get_canvas first to learn the real ids.",
        inputSchema: zodToJsonSchema(UpdateInput)
      },
      {
        name: "delete_shape",
        description:
          "Delete shapes by id, or pass `all: true` to clear the canvas. Arrows bound to a deleted " +
          "shape are removed along with it.",
        inputSchema: zodToJsonSchema(DeleteInput)
      },
      {
        name: "get_canvas",
        description:
          "List everything on the canvas with resolved geometry, labels, and — for arrows — the ids " +
          "each end is bound to. Call before any edit that refers to existing content.",
        inputSchema: EMPTY_SCHEMA
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    try {
      switch (name) {
        case "create_diagram":
          return ok(await createDiagram(bridge, DiagramInput.parse(args)));
        case "create_shape":
          return ok(await createShape(bridge, CreateInput.parse(args)));
        case "connect_shapes":
          return ok(await connectShapes(bridge, ConnectInput.parse(args)));
        case "update_shape":
          return ok(await updateShape(bridge, UpdateInput.parse(args)));
        case "delete_shape":
          return ok(await deleteShape(bridge, DeleteInput.parse(args)));
        case "get_canvas":
          return ok(await getCanvas(bridge));
        default:
          return err(`Unknown tool: ${name}`);
      }
    } catch (e) {
      return err(describeError(e));
    }
  });

  return server;
}

/**
 * Zod's default message is a JSON blob that models tend to ignore. Flatten it
 * into "field: problem" lines so a failed call can actually be corrected.
 */
function describeError(e: unknown): string {
  if (e && typeof e === "object" && "issues" in e) {
    const issues = (e as { issues: { path: (string | number)[]; message: string }[] }).issues;
    const lines = issues
      .slice(0, 12)
      .map((i) => `  ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`);
    const more = issues.length > 12 ? `\n  ...and ${issues.length - 12} more` : "";
    return `Invalid arguments:\n${lines.join("\n")}${more}`;
  }
  return e instanceof Error ? e.message : String(e);
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
