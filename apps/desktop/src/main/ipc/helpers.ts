import { existsSync } from "node:fs";
import { sep as pathSep, resolve as resolvePath } from "node:path";
import { saves } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import log from "electron-log/main.js";
import { getDb } from "../db";
import { itemFile, itemsRoot } from "../paths";
import { toWireSave } from "./wire";

export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? "";
  if (!url) return false;
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl && url.startsWith(devUrl)) return true;
  if (url.startsWith("file://")) return true;
  if (url.startsWith("pond://")) return true;
  return false;
}

export function safeHandle<Args extends unknown[], R>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => R,
  bus: IpcMain = ipcMain,
): void {
  bus.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      log.warn(
        "[pond ipc] rejected untrusted sender",
        channel,
        event.senderFrame?.url ?? "<no url>",
      );
      throw new Error("untrusted sender");
    }
    return handler(event, ...(args as Args));
  });
}

export async function resolveSaveFilePath(
  id: string,
  fileIndex: number | undefined,
): Promise<
  | { ok: true; path: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "no_files"
        | "out_of_range"
        | "missing"
        | "unsafe_path";
    }
> {
  try {
    const db = await getDb();
    const rows = await db.select().from(saves).where(eq(saves.id, id));
    const row = rows[0];
    if (!row) return { ok: false, reason: "not_found" };

    const files = toWireSave(row).files ?? [];
    if (files.length === 0) return { ok: false, reason: "no_files" };

    const idx = typeof fileIndex === "number" ? fileIndex : 0;
    const file = files[idx];
    if (!file) return { ok: false, reason: "out_of_range" };

    const absolute = resolvePath(itemFile(id, file.path));
    const root = resolvePath(itemsRoot());
    if (absolute !== root && !absolute.startsWith(root + pathSep)) {
      log.warn("[pond ipc] refused path outside library", { id, absolute });
      return { ok: false, reason: "unsafe_path" };
    }
    if (!existsSync(absolute)) return { ok: false, reason: "missing" };
    return { ok: true, path: absolute };
  } catch (err) {
    log.warn("[pond ipc] resolveSaveFilePath failed", err);
    return { ok: false, reason: "not_found" };
  }
}

export function sanitizeFtsQuery(q: string): string {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return q.replace(/["()*]/g, "");
  return tokens.map((t) => `${t}*`).join(" AND ");
}

export function hexToRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  if (hex.length !== 6) return null;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
  return { r, g, b };
}

export type IngestSource =
  | "twitter"
  | "instagram"
  | "pinterest"
  | "arena"
  | "cosmos"
  | "tiktok"
  | "youtube"
  | "article";

export function inferSource(host: string): IngestSource {
  const tail = host.split(".").slice(-2).join(".");
  if (host.endsWith("twitter.com") || host.endsWith("x.com")) return "twitter";
  if (host.endsWith("instagram.com")) return "instagram";
  if (host.endsWith("pinterest.com") || host.endsWith("pinterest.co.uk"))
    return "pinterest";
  if (host.endsWith("are.na")) return "arena";
  if (host.endsWith("cosmos.so")) return "cosmos";
  if (host.endsWith("tiktok.com")) return "tiktok";
  if (host.endsWith("youtube.com") || tail === "youtu.be") return "youtube";
  return "article";
}

export type QueryParams = Record<string, unknown>;
export type QueryHandler = (
  params: QueryParams,
  event?: IpcMainInvokeEvent,
) => Promise<unknown> | unknown;
export type QueryHandlerMap = Record<string, QueryHandler>;
