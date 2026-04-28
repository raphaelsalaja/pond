import { existsSync } from "node:fs";
import { sep as pathSep, resolve as resolvePath } from "node:path";
import {
  DEFAULT_AI_AUTONOMY,
  DEFAULT_VIDEO_DOWNLOAD,
  saves,
  settings as settingsTable,
  tags,
  type VideoDownloadSettings,
} from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { desc, eq, isNotNull } from "drizzle-orm";
import { app, BrowserWindow, clipboard, ipcMain, Menu, shell } from "electron";
import log from "electron-log/main.js";
import { IPC } from "../../shared/constants";
import { redownloadVideoForSave } from "../core/auto-video";
import { executeBatch, executeTransaction } from "../core/executor";
import { setVideoDownloadPrefs } from "../core/prefs";
import {
  disconnectSource,
  isSourceConnected,
  refreshSave,
  signInToSource,
} from "../core/refresh";
import {
  binariesAvailable,
  invalidateBinariesCache,
} from "../core/refresh/binaries";
import { reconcileLibrary } from "../core/scan";
import { canRedo, canUndo, recordForUndo, redo, undo } from "../core/undo";
import { getDb } from "../db";
import {
  getAiGatewayKey,
  getIngestToken,
  rotateIngestToken,
  setAiGatewayKey,
} from "../keychain";
import { itemDir, itemFile, itemsRoot } from "../paths";
import { toWireSave, toWireSaves } from "./wire";

/**
 * The renderer's only way into the executor. Every handler here is a thin
 * wrapper — the real work lives in `core/executor.ts`.
 */
export function registerIpc() {
  ipcMain.handle(IPC.appInfo, () => ({
    name: "pond",
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  }));

  ipcMain.handle(IPC.tx, async (_, tx: Transaction) => {
    const action = await executeTransaction(tx);
    recordForUndo(tx);
    return action;
  });

  ipcMain.handle(IPC.txBatch, async (_, txs: Transaction[]) => {
    const actions = await executeBatch(txs);
    for (const tx of txs) recordForUndo(tx);
    return actions;
  });

  ipcMain.handle(IPC.undo, async () => {
    const ok = await undo();
    return { ok, canUndo: canUndo(), canRedo: canRedo() };
  });

  ipcMain.handle(IPC.redo, async () => {
    const ok = await redo();
    return { ok, canUndo: canUndo(), canRedo: canRedo() };
  });

  ipcMain.handle(IPC.query, async (_, name: string, params: unknown) => {
    try {
      return await runQuery(name, params);
    } catch (err) {
      log.error("[pond ipc] query failed", name, err);
      throw err;
    }
  });

  // Open a URL in the user's default browser. We validate the scheme
  // before handing off to `shell.openExternal` so a compromised
  // renderer can't weaponise this into launching file:// / custom
  // handlers.
  ipcMain.handle(IPC.openExternal, async (_, url: string) => {
    try {
      const parsed = new URL(String(url));
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`refused to open non-http(s) URL: ${parsed.protocol}`);
      }
      await shell.openExternal(parsed.toString());
      return { ok: true };
    } catch (err) {
      log.warn("[pond ipc] openExternal failed", err);
      return { ok: false };
    }
  });

  ipcMain.handle(IPC.revealSave, async (_, id: string, fileIndex?: number) => {
    const target = await resolveSaveFilePath(id, fileIndex);
    if (!target.ok) return target;
    shell.showItemInFolder(target.path);
    return { ok: true as const };
  });

  ipcMain.handle(
    IPC.openSaveFile,
    async (_, id: string, fileIndex?: number) => {
      const target = await resolveSaveFilePath(id, fileIndex);
      if (!target.ok) return target;
      const err = await shell.openPath(target.path);
      if (err) {
        log.warn("[pond ipc] openSaveFile failed", err);
        return { ok: false as const, reason: err };
      }
      return { ok: true as const };
    },
  );

  // In-app metadata refresh. Returns a structured outcome the renderer
  // uses to decide whether to show a success toast, an error toast, or
  // a "Connect <source>" prompt that links into Settings.
  ipcMain.handle(IPC.refreshSave, async (_, id: string) => {
    try {
      return await refreshSave(String(id));
    } catch (err) {
      log.error("[pond ipc] refreshSave failed", err);
      return { ok: false as const, reason: "internal_error" as const };
    }
  });

  ipcMain.handle(IPC.sourceConnect, async (_, source: string) => {
    try {
      return await signInToSource(
        source as Parameters<typeof signInToSource>[0],
      );
    } catch (err) {
      log.warn("[pond ipc] sourceConnect failed", err);
      return { ok: false as const };
    }
  });

  ipcMain.handle(IPC.sourceDisconnect, async (_, source: string) => {
    try {
      return await disconnectSource(
        source as Parameters<typeof disconnectSource>[0],
      );
    } catch (err) {
      log.warn("[pond ipc] sourceDisconnect failed", err);
      return { ok: false as const };
    }
  });

  ipcMain.handle(IPC.sourceStatus, async (_, source: string) => {
    try {
      const connected = await isSourceConnected(
        source as Parameters<typeof isSourceConnected>[0],
      );
      return { ok: true as const, connected };
    } catch (err) {
      log.warn("[pond ipc] sourceStatus failed", err);
      return { ok: false as const, connected: false };
    }
  });

  // Renderer auto-heal: fired when a `<video>` errors. We hand the
  // saveId to the auto-video queue with `force: true`; it re-resolves
  // the source/url and re-runs yt-dlp with the corrected H.264-only
  // selector, overwriting the unplayable bytes. The renderer doesn't
  // need to wait — once the merge tx fires, the pool reconciler
  // pushes the new sha-bumped URL and the card heals on the next
  // commit (the broken state resets when `pickedSrc` changes).
  ipcMain.handle(IPC.videoRedownload, async (_, id: string) => {
    try {
      return await redownloadVideoForSave(String(id));
    } catch (err) {
      log.warn("[pond ipc] videoRedownload failed", err);
      return { ok: false as const, reason: "internal_error" as const };
    }
  });

  ipcMain.handle(IPC.videoToolsStatus, async () => {
    const { ytdlp, ffmpeg } = binariesAvailable();
    return {
      ok: true as const,
      ytdlp: { available: ytdlp !== null, path: ytdlp },
      ffmpeg: { available: ffmpeg !== null, path: ffmpeg },
    };
  });

  // Re-run the same postinstall script that ships yt-dlp into
  // `apps/desktop/resources/bin/`. We resolve the script path relative
  // to the running binary so it works in both dev and packaged builds
  // (in packaged builds we ship the script alongside the binary).
  // The `invalidateBinariesCache` call after the re-run forces the
  // next `binariesAvailable()` lookup to re-stat the disk so the UI
  // can transition straight from "Missing" → "Available".
  ipcMain.handle(IPC.videoToolsReinstall, async () => {
    try {
      const { reinstallYtDlp } = await import("../core/refresh/install");
      const result = await reinstallYtDlp();
      invalidateBinariesCache();
      return { ok: result.ok as boolean, message: result.message };
    } catch (err) {
      log.warn("[pond ipc] videoToolsReinstall failed", err);
      return { ok: false as const, message: String(err) };
    }
  });

  ipcMain.handle(IPC.saveContextMenu, async (event, id: string) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const db = await getDb();
      const rows = await db.select().from(saves).where(eq(saves.id, id));
      const save = rows[0];
      if (!save) return { ok: false as const, reason: "not_found" };

      const wire = toWireSave(save);
      const hasFiles = Array.isArray(wire.files) && wire.files.length > 0;
      const isTrashed = Boolean(wire.deletedAt);

      const menu = Menu.buildFromTemplate([
        {
          label: "Open with Default App",
          enabled: hasFiles,
          click: () => {
            const f = wire.files[0];
            if (!f) return;
            void shell.openPath(itemFile(id, f.path)).then((err) => {
              if (err) log.warn("[pond ctx] openPath failed", err);
            });
          },
        },
        {
          label:
            process.platform === "darwin"
              ? "Reveal in Finder"
              : process.platform === "win32"
                ? "Show in Explorer"
                : "Show in File Manager",
          enabled: hasFiles,
          click: () => {
            const f = wire.files[0];
            if (f) shell.showItemInFolder(itemFile(id, f.path));
            else shell.showItemInFolder(itemDir(id));
          },
        },
        { type: "separator" },
        {
          label: "Copy URL",
          enabled: Boolean(wire.url),
          click: () => clipboard.writeText(wire.url ?? ""),
        },
        {
          label: "Copy File Path",
          enabled: hasFiles,
          click: () => {
            const f = wire.files[0];
            if (f) clipboard.writeText(itemFile(id, f.path));
          },
        },
        { type: "separator" },
        ...(isTrashed
          ? [
              {
                label: "Restore from Trash",
                click: async () => {
                  try {
                    const tx: Transaction = {
                      kind: "untrash",
                      model: "save",
                      id,
                    };
                    await executeTransaction(tx);
                    recordForUndo(tx);
                  } catch (err) {
                    log.warn("[pond ctx] untrash failed", err);
                  }
                },
              },
              {
                label: "Delete Forever",
                click: async () => {
                  try {
                    const tx: Transaction = {
                      kind: "purge",
                      model: "save",
                      id,
                      before: save,
                    };
                    await executeTransaction(tx);
                    recordForUndo(tx);
                  } catch (err) {
                    log.warn("[pond ctx] purge failed", err);
                  }
                },
              },
            ]
          : [
              {
                label: "Move to Trash",
                click: async () => {
                  try {
                    const tx: Transaction = {
                      kind: "trash",
                      model: "save",
                      id,
                    };
                    await executeTransaction(tx);
                    recordForUndo(tx);
                  } catch (err) {
                    log.warn("[pond ctx] trash failed", err);
                  }
                },
              },
            ]),
        { type: "separator" },
        {
          label: "Refresh Metadata",
          enabled: Boolean(wire.url),
          click: () => {
            void refreshSave(id).catch((err) => {
              log.warn("[pond ctx] refreshSave failed", err);
            });
          },
        },
        {
          label: "Open Original URL in Browser",
          enabled: Boolean(wire.url),
          click: () => {
            try {
              const parsed = new URL(String(wire.url ?? ""));
              if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                void shell.openExternal(parsed.toString());
              }
            } catch {
              /* malformed URL, drop silently */
            }
          },
        },
      ]);
      menu.popup({ window: win });
      return { ok: true as const };
    } catch (err) {
      log.warn("[pond ipc] saveContextMenu failed", err);
      return { ok: false as const, reason: "internal_error" };
    }
  });
}

/**
 * Look up a save's file path by id + optional index, and confirm the
 * resolved path is inside the library's `items/` root before handing it
 * to `shell`. Defends against both path-traversal (`../../etc/passwd`
 * stored in a malicious file entry) and a compromised renderer passing
 * an id that doesn't belong to any save.
 */
async function resolveSaveFilePath(
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

/**
 * Named read-only queries. New queries get added here rather than as raw
 * SQL in the renderer so we can swap to the vec0 table, FTS5, or a Rust
 * worker later without touching the UI.
 */
async function runQuery(name: string, raw: unknown): Promise<unknown> {
  const params = (raw ?? {}) as Record<string, unknown>;
  const db = await getDb();
  switch (name) {
    case "saves.list": {
      const limit = Math.min(Number(params.limit ?? 200), 1000);
      // No status filtering: we hand the renderer the full set (active +
      // trashed) so the sidebar / Library / Trash views can all read from
      // the same Object Pool. Volume is small enough that this is fine.
      const rows = await db
        .select()
        .from(saves)
        .orderBy(desc(saves.savedAt))
        .limit(limit);
      return toWireSaves(rows);
    }
    case "saves.emptyTrash": {
      // Hard-delete every row currently in the trash. Each row gets its
      // own purge tx so undo can theoretically resurrect a single item;
      // they're coalesced under one batchId for the activity feed.
      const rows = await db
        .select()
        .from(saves)
        .where(isNotNull(saves.deletedAt));
      if (rows.length === 0) return { ok: true, count: 0 };
      const txs: Transaction[] = rows.map((r) => ({
        kind: "purge",
        model: "save",
        id: r.id,
        before: r,
        meta: { actor: "user", actorReason: "empty-trash" },
      }));
      await executeBatch(txs);
      for (const tx of txs) recordForUndo(tx);
      return { ok: true, count: txs.length };
    }
    case "saves.restoreAll": {
      const rows = await db
        .select({ id: saves.id })
        .from(saves)
        .where(isNotNull(saves.deletedAt));
      if (rows.length === 0) return { ok: true, count: 0 };
      const txs: Transaction[] = rows.map((r) => ({
        kind: "untrash",
        model: "save",
        id: r.id,
        meta: { actor: "user", actorReason: "restore-all" },
      }));
      await executeBatch(txs);
      for (const tx of txs) recordForUndo(tx);
      return { ok: true, count: txs.length };
    }
    case "saves.get": {
      const id = String(params.id ?? "");
      if (!id) return null;
      const rows = await db.select().from(saves).where(eq(saves.id, id));
      return rows[0] ? toWireSave(rows[0]) : null;
    }
    case "tags.list": {
      const rows = await db.select().from(tags);
      return rows;
    }
    case "settings.get": {
      const rows = await db
        .select()
        .from(settingsTable)
        .where(eq(settingsTable.id, "singleton"));
      if (rows[0]) {
        // `videoDownload` is a recent addition; pre-existing rows from
        // before the migration ran return `null` from the JSON column
        // until the user explicitly saves prefs. Materialise defaults so
        // the renderer never has to special-case `null`.
        return {
          ...rows[0],
          videoDownload: rows[0].videoDownload ?? DEFAULT_VIDEO_DOWNLOAD,
        };
      }
      // Seed defaults on first read.
      await db
        .insert(settingsTable)
        .values({
          id: "singleton",
          aiAutonomy: DEFAULT_AI_AUTONOMY,
          videoDownload: DEFAULT_VIDEO_DOWNLOAD,
        })
        .onConflictDoNothing()
        .run();
      return {
        id: "singleton",
        aiAutonomy: DEFAULT_AI_AUTONOMY,
        videoDownload: DEFAULT_VIDEO_DOWNLOAD,
        libraryRoot: null,
        updatedAt: new Date(),
      };
    }
    case "settings.setVideoDownload": {
      const next = await setVideoDownloadPrefs(
        params as Partial<VideoDownloadSettings>,
      );
      return { ok: true, videoDownload: next };
    }
    case "settings.ingestToken": {
      return { token: await getIngestToken() };
    }
    case "settings.onboarded": {
      const rows = await db
        .select({ onboarded: settingsTable.onboarded })
        .from(settingsTable)
        .where(eq(settingsTable.id, "singleton"));
      return Boolean(rows[0]?.onboarded);
    }
    case "settings.markOnboarded": {
      await db
        .insert(settingsTable)
        .values({
          id: "singleton",
          aiAutonomy: DEFAULT_AI_AUTONOMY,
          onboarded: Boolean(params.value ?? true),
        })
        .onConflictDoUpdate({
          target: settingsTable.id,
          set: { onboarded: Boolean(params.value ?? true) },
        })
        .run();
      return { ok: true };
    }
    case "settings.rotateIngestToken": {
      return { token: await rotateIngestToken() };
    }
    case "settings.aiGatewayKey": {
      return { key: await getAiGatewayKey() };
    }
    case "settings.setAiGatewayKey": {
      await setAiGatewayKey(String(params.key ?? ""));
      return { ok: true };
    }
    case "library.rescan": {
      return await reconcileLibrary();
    }
    case "saves.search": {
      const q = String(params.q ?? "").trim();
      const limit = Math.min(Number(params.limit ?? 100), 500);
      if (!q) return [];
      const ftsRows = db.$raw
        .prepare(
          `SELECT id FROM saves_fts WHERE saves_fts MATCH ? ORDER BY rank LIMIT ?`,
        )
        .all(q, limit) as Array<{ id: string }>;
      if (ftsRows.length === 0) return [];
      const ids = ftsRows.map((r) => r.id);
      // Load full rows preserving FTS rank order.
      const rows = await db.select().from(saves);
      const byId = new Map(rows.map((r) => [r.id, r]));
      return toWireSaves(
        ids
          .map((id) => byId.get(id))
          .filter((r): r is NonNullable<typeof r> => !!r),
      );
    }
    default:
      throw new Error(`unknown query: ${name}`);
  }
}
