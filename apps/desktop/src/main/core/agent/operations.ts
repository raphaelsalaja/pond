import type { JsonObject, JsonValue } from "@pond/schema/json";
import { z } from "zod";
import type { AgentOperationRequest } from "../../../shared/agent-operations";
import { PondError } from "../../lib/pond-error";
import type { ToolSpec } from "./complete";

export interface PondOperation {
  name: string;
  description: string;
  access: "read" | "review";
  inputSchema: z.ZodType;
  execute: (args: JsonObject) => Promise<JsonValue>;
}

export interface OperationCatalog {
  operations: ReadonlyArray<PondOperation>;
  libraryId: () => string;
}

let registered: OperationCatalog = { operations: [], libraryId: () => "" };

export function registerPondOperations(catalog: OperationCatalog): void {
  const names = new Set(catalog.operations.map((operation) => operation.name));
  if (names.size !== catalog.operations.length) {
    throw new Error("Duplicate Pond operation names.");
  }
  registered = catalog;
}

export function pondOperationCatalog(): OperationCatalog {
  return registered;
}

let external: () => ReadonlyArray<PondOperation> = () => [];

/** MCP tools join only the Fish catalog; the Local API's `/operations` keeps the base catalog. */
export function registerExternalOperations(
  source: () => ReadonlyArray<PondOperation>,
): void {
  external = source;
}

export function fishOperationCatalog(): OperationCatalog {
  const base = new Set(registered.operations.map((o) => o.name));
  return {
    operations: [
      ...registered.operations,
      ...external().filter((o) => !base.has(o.name)),
    ],
    libraryId: registered.libraryId,
  };
}

function findOperation(name: string, catalog: OperationCatalog) {
  const operation = catalog.operations.find((entry) => entry.name === name);
  if (!operation) {
    throw new PondError(
      "operation_not_found",
      `Pond operation unavailable: ${name}`,
    );
  }
  return operation;
}

export async function applyPondOperation(
  request: AgentOperationRequest,
  catalog = fishOperationCatalog(),
): Promise<JsonValue> {
  if (catalog.libraryId() !== request.libraryId) {
    throw new PondError(
      "library_mismatch",
      "The Library changed. Request this operation again.",
    );
  }
  const operation = findOperation(request.operation, catalog);
  operation.inputSchema.parse(request.arguments);
  const result = await operation.execute(request.arguments);
  const failure = z
    .object({
      ok: z.literal(false),
      error: z.string().optional(),
      reason: z.string().optional(),
    })
    .safeParse(result);
  if (failure.success) {
    throw new PondError(
      "operation_failed",
      failure.data.error ??
        failure.data.reason ??
        "The operation did not finish.",
    );
  }
  return result;
}

const discoverInput = z.object({
  query: z.string().default(""),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(40).default(20),
});
const describeInput = z.object({ operation: z.string().min(1) });
const resultInput = z.object({
  resultId: z.string().min(1),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(16_000).default(8000),
});

export function summarizeOperationResult(result: JsonValue): JsonValue {
  const text = JSON.stringify(result);
  return text.length <= 16_000
    ? result
    : {
        truncated: true,
        totalCharacters: text.length,
        text: text.slice(0, 16_000),
      };
}

const runInput = describeInput.extend({
  arguments: z.record(z.string(), z.json()).default({}),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe(
      "Short, plain-language summary of the requested action, shown on its review card.",
    ),
});

export function pondOperationTools(
  input: {
    signal: AbortSignal;
    propose: (
      request: AgentOperationRequest,
      description: string,
      reason: string,
    ) => string;
  },
  catalog?: OperationCatalog,
): Array<ToolSpec> {
  const current = () => catalog ?? fishOperationCatalog();
  const origin = current().libraryId();
  const results = new Map<string, string>();
  let resultSequence = 0;
  return [
    {
      name: "discoverPondOperations",
      description:
        "Find Pond capabilities for Saves, folders, tags, Smart Folders, imports, exports, conversion, downloads, sources, settings, storage, navigation, tools from your MCP servers, and more. Search by a short feature or action name; omit query to browse. Read the operation schema before calling it. Do not claim Pond cannot do something without checking here.",
      schema: discoverInput,
      execute: async (args) => {
        input.signal.throwIfAborted();
        const { query, offset, limit } = discoverInput.parse(args);
        const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const { operations } = current();
        const matches = operations.filter((operation) => {
          const text =
            `${operation.name} ${operation.description}`.toLocaleLowerCase();
          return terms.every((term) => text.includes(term));
        });
        return {
          categories: [
            ...new Set(
              operations.map(
                (operation) => operation.name.split(".")[0] ?? operation.name,
              ),
            ),
          ],
          operations: matches
            .slice(offset, offset + limit)
            .map(({ name, description, access }) => ({
              name,
              description,
              requiresReview: access === "review",
            })),
          total: matches.length,
          nextOffset: offset + limit < matches.length ? offset + limit : null,
        };
      },
    },
    {
      name: "describePondOperation",
      description:
        "Read the exact input schema and review requirement for a Pond operation. Use the app's real IDs and current values. For settings patches, read current preferences first and change only requested fields.",
      schema: describeInput,
      execute: async (args) => {
        input.signal.throwIfAborted();
        const operation = findOperation(
          describeInput.parse(args).operation,
          current(),
        );
        return {
          name: operation.name,
          description: operation.description,
          requiresReview: operation.access === "review",
          inputSchema: z.json().parse(
            z.toJSONSchema(operation.inputSchema, {
              io: "input",
              unrepresentable: "any",
            }),
          ),
        };
      },
    },
    {
      name: "runPondOperation",
      description:
        "Use a discovered Pond capability with arguments matching its schema. Reads and native UI flows run immediately. Changes are prepared for Apply in the chat; a pending review is not a completed operation. Never report success until the operation actually completes.",
      schema: runInput,
      execute: async (args) => {
        input.signal.throwIfAborted();
        if (current().libraryId() !== origin) {
          throw new Error("The Library changed. Start a new request.");
        }
        const parsed = runInput.parse(args);
        const operation = findOperation(parsed.operation, current());
        operation.inputSchema.parse(parsed.arguments);
        const request = {
          operation: operation.name,
          arguments: parsed.arguments,
          libraryId: origin,
        };
        if (operation.access === "review") {
          return {
            status: "pending-review",
            changeId: input.propose(
              request,
              operation.description,
              parsed.reason,
            ),
          };
        }
        const result = await applyPondOperation(request, current());
        input.signal.throwIfAborted();
        const text = JSON.stringify(result);
        if (text.length <= 16_000) return { status: "complete", result };
        const resultId = `result-${++resultSequence}`;
        results.set(resultId, text);
        if (results.size > 4) {
          const oldest = results.keys().next().value;
          if (oldest) results.delete(oldest);
        }
        return {
          status: "complete",
          resultId,
          ...z
            .object({
              truncated: z.boolean(),
              totalCharacters: z.number(),
              text: z.string(),
            })
            .parse(summarizeOperationResult(result)),
          nextOffset: 16_000,
        };
      },
    },
    {
      name: "readPondOperationResult",
      description:
        "Read the next character range of a large JSON result without rerunning its operation. Only the four most recent large results in this turn are retained. Prefer paginated queries for large libraries.",
      schema: resultInput,
      execute: async (args) => {
        input.signal.throwIfAborted();
        if (current().libraryId() !== origin) {
          throw new Error("The Library changed. Start a new request.");
        }
        const { resultId, offset, limit } = resultInput.parse(args);
        const text = results.get(resultId);
        if (text === undefined) {
          throw new Error(
            "This result is no longer available. Use a narrower read query.",
          );
        }
        return {
          resultId,
          text: text.slice(offset, offset + limit),
          totalCharacters: text.length,
          nextOffset: offset + limit < text.length ? offset + limit : null,
        };
      },
    },
  ];
}
