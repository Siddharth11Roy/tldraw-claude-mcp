import type { ZodTypeAny } from "zod";
import { zodToJsonSchema as convert } from "zod-to-json-schema";

/**
 * Convert a zod schema to the JSON Schema an MCP client advertises to the model.
 *
 * This used to return a placeholder object, which meant the model received no
 * field names, no enums and no required list — it had to guess the entire input
 * shape from the tool description. That is the single biggest source of
 * malformed diagrams, so the real converter is worth the dependency.
 *
 * `$ref`/`definitions` are inlined because several MCP clients do not resolve
 * internal references in tool schemas.
 */
export function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const out = convert(schema, {
    $refStrategy: "none",
    target: "jsonSchema7"
  }) as Record<string, unknown>;

  // The top-level $schema key is noise for tool definitions.
  delete out.$schema;
  return out;
}

/** Schema for a tool that takes no arguments. */
export const EMPTY_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {},
  additionalProperties: false
};
