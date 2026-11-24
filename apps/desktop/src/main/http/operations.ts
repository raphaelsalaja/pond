import { randomUUID } from "node:crypto";
import {
  ApiOperationRequestSchema,
  ApiOperationRunSchema,
} from "@pond/schema/api";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  applyPondOperation,
  pondOperationCatalog,
} from "../core/agent/operations";
import { apiError, handleApiError, invalidRequest } from "./errors";

interface Preview {
  operation: string;
  arguments: string;
  libraryId: string;
  expiresAt: number;
}

const previews = new Map<string, Preview>();
const PREVIEW_TTL_MS = 5 * 60_000;

function operation(name: string) {
  return pondOperationCatalog().operations.find((entry) => entry.name === name);
}

function operationNotFound(c: Context, name: string): Response {
  return apiError(c, "operation_not_found", `No operation is named ${name}.`);
}

function prunePreviews(now = Date.now()): void {
  for (const [token, preview] of previews) {
    if (preview.expiresAt <= now) {
      previews.delete(token);
    }
  }
}

export function operationRoutes(): Hono {
  const routes = new Hono();

  routes.get("/", (c) =>
    c.json({
      status: "success",
      data: pondOperationCatalog().operations.map((entry) => ({
        name: entry.name,
        description: entry.description,
        access: entry.access,
        inputSchema: z.toJSONSchema(entry.inputSchema, {
          io: "input",
          unrepresentable: "any",
        }),
      })),
    }),
  );

  routes.post("/preview", async (c) => {
    const parsed = ApiOperationRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return invalidRequest(c, parsed.error);
    }
    const selected = operation(parsed.data.operation);
    if (!selected) {
      return operationNotFound(c, parsed.data.operation);
    }
    selected.inputSchema.parse(parsed.data.arguments);
    const libraryId = pondOperationCatalog().libraryId();
    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TTL_MS;
    prunePreviews();
    previews.set(token, {
      operation: selected.name,
      arguments: JSON.stringify(parsed.data.arguments),
      libraryId,
      expiresAt,
    });
    return c.json({
      status: "success",
      data: { token, operation: selected.name, libraryId, expiresAt },
    });
  });

  routes.post("/run", async (c) => {
    const parsed = ApiOperationRunSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return invalidRequest(c, parsed.error);
    }
    const selected = operation(parsed.data.operation);
    if (!selected) {
      return operationNotFound(c, parsed.data.operation);
    }
    selected.inputSchema.parse(parsed.data.arguments);
    const libraryId = pondOperationCatalog().libraryId();
    if (selected.access === "review") {
      const preview = parsed.data.token
        ? previews.get(parsed.data.token)
        : undefined;
      if (parsed.data.token) {
        previews.delete(parsed.data.token);
      }
      if (
        !preview ||
        preview.expiresAt <= Date.now() ||
        preview.operation !== selected.name ||
        preview.libraryId !== libraryId ||
        preview.arguments !== JSON.stringify(parsed.data.arguments)
      ) {
        return apiError(
          c,
          "stale_preview",
          "The preview expired or changed. Preview the operation again.",
        );
      }
    }
    const result = await applyPondOperation(
      {
        operation: selected.name,
        arguments: parsed.data.arguments,
        libraryId,
      },
      pondOperationCatalog(),
    );
    return c.json({ status: "success", data: result });
  });

  routes.onError(handleApiError);

  return routes;
}
