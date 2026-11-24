import type { ApiErrorCode } from "@pond/schema/api";
import log from "electron-log/main.js";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { PondError } from "../lib/pond-error";

const STATUS = {
  invalid_json: 400,
  invalid_request: 422,
  unauthorized: 401,
  forbidden: 403,
  rate_limited: 429,
  not_found: 404,
  save_not_found: 404,
  no_thumbnail: 404,
  operation_not_found: 404,
  folder_not_found: 404,
  operation_failed: 422,
  unsupported_url: 422,
  stale_cursor: 409,
  library_mismatch: 409,
  stale_preview: 409,
  library_unavailable: 409,
  internal: 500,
} satisfies Record<ApiErrorCode, ContentfulStatusCode>;

export function apiError(
  c: Context,
  code: ApiErrorCode,
  message: string,
): Response {
  return c.json({ status: "error", error: { code, message } }, STATUS[code]);
}

export function invalidRequest(c: Context, error: z.ZodError): Response {
  return apiError(c, "invalid_request", z.prettifyError(error));
}

function isZodError(error: Error): error is z.ZodError {
  return "issues" in error && Array.isArray(error.issues);
}

export function handleApiError(error: Error, c: Context): Response {
  if (error instanceof PondError) {
    return apiError(c, error.code, error.message);
  }
  if (error instanceof SyntaxError) {
    return apiError(c, "invalid_json", "The request body isn't valid JSON.");
  }
  if (isZodError(error)) {
    return invalidRequest(c, error);
  }
  log.error("[pond http] unhandled error", error);
  return apiError(
    c,
    "internal",
    error.message || "Pond couldn't finish the request.",
  );
}
