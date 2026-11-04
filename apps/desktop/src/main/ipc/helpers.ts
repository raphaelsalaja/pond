import { existsSync } from "node:fs";
import { sep as pathSep, resolve as resolvePath } from "node:path";
import { saves } from "@pond/schema/db";
import { eq, inArray } from "drizzle-orm";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import log from "electron-log/main.js";
import { POND_PROTOCOL } from "../../shared/constants";
import type { ReasonResult } from "../../shared/query-contracts-shared";
import { isAuxiliaryKind } from "../../shared/save-file-names";
import type { SaveFileFailure } from "../../shared/saves-contracts-shared";
import { getDb } from "../db";
import { canonicalPondSaveId } from "../lib/pond-url";
import { saveFile, savesRoot } from "../paths";
import { toWireSave } from "./wire";

export function isTrustedSender(event: {
  senderFrame?: { url: string } | null;
}): boolean {
  const url = event.senderFrame?.url ?? "";
  if (!url) return false;
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl && url.startsWith(devUrl)) return true;
  if (url.startsWith("file://")) return true;
  if (url.startsWith("pond://")) return true;
  return false;
}

function isInsideLibrary(absolute: string): boolean {
  const root = resolvePath(savesRoot());
  return absolute === root || absolute.startsWith(root + pathSep);
}

export function safeHandle<Args extends unknown[], R>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => R,
  bus: IpcMain = ipcMain,
): void {
  bus.handle(channel, (event: IpcMainInvokeEvent, ...args: Args) => {
    if (!isTrustedSender(event)) {
      log.warn(
        "[pond ipc] rejected untrusted sender",
        channel,
        event.senderFrame?.url ?? "<no url>",
      );
      throw new Error("untrusted sender");
    }
    return handler(event, ...args);
  });
}

export async function resolveSaveFilePath(
  id: string,
  fileIndex: number | undefined,
): Promise<ReasonResult<SaveFileFailure, { path: string }>> {
  try {
    const db = await getDb();
    const rows = await db.select().from(saves).where(eq(saves.id, id));
    const row = rows[0];
    if (!row) return { ok: false, reason: "not_found" };

    return resolveRowFile(id, toWireSave(row).files ?? [], fileIndex);
  } catch (err) {
    log.warn("[pond ipc] resolveSaveFilePath failed", err);
    return { ok: false, reason: "not_found" };
  }
}

function resolveRowFile(
  id: string,
  files: ReadonlyArray<{ kind: string; path: string }>,
  fileIndex: number | undefined,
): ReasonResult<SaveFileFailure, { path: string }> {
  if (files.length === 0) return { ok: false, reason: "no_files" };
  const file = files[fileIndex ?? 0];
  if (!file) return { ok: false, reason: "out_of_range" };
  if (isAuxiliaryKind(file.kind)) {
    return { ok: false, reason: "auxiliary_file" };
  }
  const absolute = resolvePath(saveFile(id, file.path));
  if (!isInsideLibrary(absolute)) {
    log.warn("[pond ipc] refused path outside library", { id, absolute });
    return { ok: false, reason: "unsafe_path" };
  }
  if (!existsSync(absolute)) return { ok: false, reason: "missing" };
  return { ok: true, path: absolute };
}

export interface SaveDragFile {
  id: string;
  path: string;
  preview: string | null;
}

const PREVIEW_KINDS = ["thumbnail", "poster"];

/** One query for the whole selection, each save resolving its own file index. */
export async function resolveSaveDragFiles(
  requests: ReadonlyArray<{ id: string; fileIndex: number }>,
): Promise<SaveDragFile[]> {
  if (requests.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select()
    .from(saves)
    .where(
      inArray(
        saves.id,
        requests.map((request) => request.id),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, toWireSave(row)]));
  return requests.flatMap(({ id, fileIndex }) => {
    const files = byId.get(id)?.files ?? [];
    const target = resolveRowFile(id, files, fileIndex);
    if (!target.ok) return [];
    const dragged = files[fileIndex];
    const previewFile =
      PREVIEW_KINDS.map((kind) =>
        files.find((file) => file.kind === kind),
      ).find(Boolean) ??
      (dragged?.mimeType?.startsWith("image/") ? dragged : undefined);
    const preview = previewFile
      ? resolvePath(saveFile(id, previewFile.path))
      : null;
    return [
      {
        id,
        path: target.path,
        preview: preview && isInsideLibrary(preview) ? preview : null,
      },
    ];
  });
}

export function resolvePondSavePath(
  src: string,
): { saveId: string; path: string } | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== `${POND_PROTOCOL}:`) return null;
  const saveId = canonicalPondSaveId(url.hostname);
  const file = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!saveId || !file) return null;
  const absolute = resolvePath(saveFile(saveId, file));
  if (!isInsideLibrary(absolute)) {
    log.warn("[pond ipc] refused pond URL outside library", { src, absolute });
    return null;
  }
  if (!existsSync(absolute)) return null;
  return { saveId, path: absolute };
}
