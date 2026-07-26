import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "../src/jsonSchema.js";
import { CreateInput } from "../src/tools/create.js";
import { DiagramInput } from "../src/tools/diagram.js";
import { ConnectInput } from "../src/tools/connect.js";

/**
 * These guard the regression that mattered most: the converter used to return a
 * placeholder, so the model saw no field names or enums at all and had to guess
 * the entire input shape.
 */
describe("zodToJsonSchema", () => {
  it("describes create_shape's real fields", () => {
    const schema = zodToJsonSchema(CreateInput) as any;
    expect(schema.type).toBe("object");
    expect(schema.properties.shapes).toBeDefined();
    expect(schema.required).toContain("shapes");
    expect(JSON.stringify(schema)).toContain("rectangle");
  });

  it("exposes the diagram graph vocabulary including roles and direction", () => {
    const schema = zodToJsonSchema(DiagramInput) as any;
    const text = JSON.stringify(schema);
    expect(schema.properties.nodes).toBeDefined();
    expect(schema.properties.edges).toBeDefined();
    for (const token of ["decision", "process", "start", "down", "right", "elbow"]) {
      expect(text, `missing ${token}`).toContain(token);
    }
  });

  it("inlines definitions, since not every MCP client resolves $ref", () => {
    for (const s of [CreateInput, DiagramInput, ConnectInput]) {
      const text = JSON.stringify(zodToJsonSchema(s));
      expect(text).not.toContain("$ref");
      expect(text).not.toContain("definitions");
    }
  });

  it("drops the $schema key that only adds noise to a tool definition", () => {
    expect((zodToJsonSchema(ConnectInput) as any).$schema).toBeUndefined();
  });

  it("keeps field descriptions, which are the model's only usage hints", () => {
    const text = JSON.stringify(zodToJsonSchema(ConnectInput));
    expect(text).toContain("description");
    expect(text).toContain("connector starts at");
  });
});
