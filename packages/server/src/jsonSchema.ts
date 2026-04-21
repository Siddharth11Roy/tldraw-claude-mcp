import type { ZodTypeAny } from "zod";

// Minimal zod -> JSON Schema converter. We intentionally keep this tiny rather
// than pulling another dep; MCP clients only need the inputSchema for hints.
// For fidelity-critical use cases we still validate with zod inside the handler.
export function zodToJsonSchema(_schema: ZodTypeAny): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: true,
    description: "See README for the full input shape; validated server-side with zod."
  };
}
