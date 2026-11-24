import { z } from "zod";

/** Mirrors `SchemaNode` and `PropertyNode` in `apple-model/main.swift`; rename keys on both sides together. */
export type AppleSchema =
  | { kind: "string" | "integer" | "number" | "boolean" }
  | { kind: "choice"; name: string; choices: Array<string> }
  | { kind: "array"; items: AppleSchema; max?: number }
  | {
      kind: "object";
      name: string;
      description?: string;
      properties: Array<AppleProperty>;
    }
  | { kind: "anyOf"; name: string; variants: Array<AppleSchema> };

export interface AppleProperty {
  name: string;
  description?: string;
  optional: boolean;
  schema: AppleSchema;
}

/** The JSON Schema keywords the converter reads, so SDK and Zod schemas both fit. */
export interface JsonSchemaNode {
  type?: string | Array<string>;
  description?: string;
  enum?: ReadonlyArray<unknown>;
  properties?: Readonly<Record<string, JsonSchemaDefinition>>;
  required?: ReadonlyArray<string>;
  items?: JsonSchemaDefinition | Array<JsonSchemaDefinition>;
  maxItems?: number;
  anyOf?: ReadonlyArray<JsonSchemaDefinition>;
  oneOf?: ReadonlyArray<JsonSchemaDefinition>;
}

type JsonSchemaDefinition = JsonSchemaNode | boolean;

export interface AppleTool {
  name: string;
  description?: string;
  inputSchema: JsonSchemaDefinition;
}

const MAX_DEPTH = 6;

const STRING: AppleSchema = { kind: "string" };

const stringChoices = z.array(z.string());

function schemaNode(definition: JsonSchemaDefinition | undefined) {
  return definition === undefined || definition === true || definition === false
    ? undefined
    : definition;
}

/** Guided generation can't emit null, so a nullable field becomes one the model may leave out. */
function isNullable(definition: JsonSchemaDefinition): boolean {
  const node = schemaNode(definition);
  if (!node) {
    return false;
  }
  const union = node.anyOf ?? node.oneOf;
  if (union) {
    return union.some((branch) => schemaNode(branch)?.type === "null");
  }
  return Array.isArray(node.type) && node.type.includes("null");
}

function convert(
  definition: JsonSchemaDefinition | undefined,
  name: string,
  depth: number,
): AppleSchema {
  const node = schemaNode(definition);
  if (!node || depth > MAX_DEPTH) {
    return STRING;
  }
  const union = node.anyOf ?? node.oneOf;
  if (union) {
    const branches = union.filter(
      (branch) => schemaNode(branch)?.type !== "null",
    );
    return branches.length === 1 ? convert(branches[0], name, depth) : STRING;
  }
  const types = Array.isArray(node.type)
    ? node.type.filter((type) => type !== "null")
    : node.type
      ? [node.type]
      : [];
  if (types.length !== 1) {
    return STRING;
  }
  const type = types[0];
  const choices = stringChoices.safeParse(node.enum);
  if (choices.success) {
    return { kind: "choice", name, choices: choices.data };
  }
  if (type === "integer" || type === "number" || type === "boolean") {
    return { kind: type };
  }
  if (type === "array") {
    const items = convert(
      Array.isArray(node.items) ? node.items[0] : node.items,
      `${name}_item`,
      depth + 1,
    );
    return node.maxItems === undefined
      ? { kind: "array", items }
      : { kind: "array", items, max: node.maxItems };
  }
  if (type === "object") {
    const required = new Set(node.required ?? []);
    return {
      kind: "object",
      name,
      description: node.description,
      properties: Object.entries(node.properties ?? {}).map(([key, value]) => ({
        name: key,
        description: schemaNode(value)?.description,
        optional: !required.has(key) || isNullable(value),
        schema: convert(value, `${name}_${key}`, depth + 1),
      })),
    };
  }
  return STRING;
}

export function toAppleSchema(
  json: JsonSchemaDefinition,
  name: string,
): AppleSchema {
  return convert(json, name, 0);
}

export function replySchemaFor(tools: ReadonlyArray<AppleTool>): AppleSchema {
  const text: AppleProperty = {
    name: "text",
    description: "Your answer to the user. Leave empty when you call a tool.",
    optional: false,
    schema: STRING,
  };
  if (tools.length === 0) {
    return { kind: "object", name: "Reply", properties: [text] };
  }
  const variants = tools.map((tool): AppleSchema => ({
    kind: "object",
    name: `Call_${tool.name}`,
    description: tool.description,
    properties: [
      {
        name: "tool",
        optional: false,
        schema: {
          kind: "choice",
          name: `Tool_${tool.name}`,
          choices: [tool.name],
        },
      },
      {
        name: "arguments",
        optional: false,
        schema: toAppleSchema(tool.inputSchema, `Args_${tool.name}`),
      },
    ],
  }));
  return {
    kind: "object",
    name: "Reply",
    properties: [
      text,
      {
        name: "call",
        description: "One Pond tool to run before you answer.",
        optional: true,
        schema: { kind: "anyOf", name: "Call", variants },
      },
    ],
  };
}
