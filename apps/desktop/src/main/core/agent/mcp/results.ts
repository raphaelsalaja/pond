import type { CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import log from "electron-log/main.js";
import { closeDb } from "../../../db";
import { readLibraryPointer } from "../../../lib/library-pointer";
import { invalidatePaths, resolvePaths } from "../../../paths";
import { invalidatePrefs } from "../../prefs";
import {
  MCP_ACCESS_OFF,
  type McpAccessGroup,
  mcpToolAllowed,
} from "../mcp-access";

function errorOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return null;
  }
  return typeof value.error === "string" ? value.error : null;
}

/** Keeps the `{ error }` JSON body older hosts parse, and flags it so newer hosts show a failed call. */
export function jsonResult(value: unknown): CallToolResult {
  const text = JSON.stringify(value ?? null);
  return errorOf(value) === null
    ? { content: [{ type: "text", text }] }
    : { content: [{ type: "text", text }], isError: true };
}

export function structuredResult<Value extends Record<string, unknown>>(
  value: Value,
): CallToolResult {
  return errorOf(value) === null
    ? {
        content: [{ type: "text", text: JSON.stringify(value) }],
        structuredContent: value,
      }
    : jsonResult(value);
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
