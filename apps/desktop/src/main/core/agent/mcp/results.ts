import type {
  CallToolResult,
  ServerContext,
} from "@modelcontextprotocol/server";
import type { JsonObject } from "@pond/schema/json";
import log from "electron-log/main.js";
import { z } from "zod";
import type { ConversionQueryResults } from "../../../../shared/conversion-contracts";
import type { LibraryQueryPage } from "../../../../shared/library-query";
import { closeDb } from "../../../db";
import { readLibraryPointer } from "../../../lib/library-pointer";
import { invalidatePaths, resolvePaths } from "../../../paths";
import { invalidatePrefs } from "../../prefs";
import type { ToolResult } from "../complete";
import {
  MCP_ACCESS_OFF,
  type McpAccessGroup,
  mcpToolAllowed,
} from "../mcp-access";
import type { listSavedViews } from "./library";

export type McpToolBody =
  | ToolResult
  | LibraryQueryPage
  | Awaited<ReturnType<typeof listSavedViews>>
  | ConversionQueryResults[keyof ConversionQueryResults];

const ErrorBodySchema = z.object({ error: z.string() });

/** Keeps the `{ error }` JSON body older hosts parse, and flags it so newer hosts show a failed call. */
export function jsonResult(value: McpToolBody): CallToolResult {
  const text = JSON.stringify(value);
  return ErrorBodySchema.safeParse(value).success
    ? { content: [{ type: "text", text }], isError: true }
    : { content: [{ type: "text", text }] };
}

export function structuredResult(value: JsonObject): CallToolResult {
  return ErrorBodySchema.safeParse(value).success
    ? jsonResult(value)
    : {
        content: [{ type: "text", text: JSON.stringify(value) }],
        structuredContent: value,
      };
}

export function errorResult(error: string): CallToolResult {
  return jsonResult({ error });
}

/** MCP hosts keep this process alive across Library switches in the app, so reopen the index when the pointer moves. */
export function followActiveLibrary(): void {
  const pointer = readLibraryPointer();
  if (!pointer || pointer === resolvePaths().libraryRoot) return;
  log.info("[pond mcp] following Library switch", pointer);
  closeDb();
  invalidatePaths();
  invalidatePrefs();
}

export async function accessError(
  group: McpAccessGroup,
): Promise<string | null> {
  followActiveLibrary();
  return (await mcpToolAllowed(group)) ? null : MCP_ACCESS_OFF[group];
}

export function withAccess<Args>(
  group: McpAccessGroup,
  run: (
    args: Args,
    ctx: ServerContext,
  ) => CallToolResult | Promise<CallToolResult>,
) {
  return async (args: Args, ctx: ServerContext): Promise<CallToolResult> => {
    const denied = await accessError(group);
    if (denied) return errorResult(denied);
    return run(args, ctx);
  };
}
