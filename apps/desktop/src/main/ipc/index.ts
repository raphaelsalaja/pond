import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { userInfo } from "node:os";
import { extname, sep as pathSep, resolve as resolvePath } from "node:path";
import type { Source } from "@pond/schema/db";
import {
  DEFAULT_AI_AUTONOMY,
  DEFAULT_VIDEO_DOWNLOAD,
  saves,
  settings as settingsTable,
  tags,
  type VideoDownloadSettings,
} from "@pond/schema/db";
import { buildWhere, type Query } from "@pond/schema/filters";
import type { Transaction } from "@pond/schema/tx";
import { desc, eq, isNotNull } from "drizzle-orm";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  shell,
} from "electron";
import log from "electron-log/main.js";
import { IPC } from "../../shared/constants";
import { redownloadVideoForSave } from "../core/auto-video";
import { executeBatch, executeTransaction } from "../core/executor";
import {
  emptyTrashOlderThan,
  exportLibraryJson,
  exportLibraryZip,
  moveLibrary,
  purgeLibrarySubdir,
  verifyLibraryIntegrity,
} from "../core/library-ops";
import { getPrefs, setPrefs, setVideoDownloadPrefs } from "../core/prefs";
import {
  disconnectSource,
  isSourceConnected,
  refreshSave,
  signInToSource,
} from "../core/refresh";
import {
  cancelRefreshBackfill,
  getRefreshBackfillStatus,
  startRefreshBackfill,
} from "../core/refresh/backfill";
import {
  binariesAvailable,
  invalidateBinariesCache,
} from "../core/refresh/binaries";
import { reconcileLibrary } from "../core/scan";
import { cancelSync, getSourceSync, isSyncing, syncSource } from "../core/sync";
import { canRedo, canUndo, recordForUndo, redo, undo } from "../core/undo";
import { getDb } from "../db";
import {
  getAiGatewayKey,
  getIngestToken,
  rotateIngestToken,
  setAiGatewayKey,
} from "../keychain";
import {
  itemDir,
  itemFile,
  itemsRoot,
  libraryRoot as libraryRootDir,
} from "../paths";
import { toWireSave, toWireSaves } from "./wire";

/**
 * Trusted sender allowlist. Every IPC handler runs through `safeHandle`
 * below, which calls `assertTrustedSender(event)` on entry. Without
 * this check, a renderer that's tricked into navigating to a foreign
 * origin (XSS, malicious save metadata) would inherit full executor
 * access — `tx`, `txBatch`, `query` give you write access to the whole
 * library.
 *
 * The trusted set is the dev URL (when set), `file://` (production
 * renderer), and `pond://` (custom protocol used for media). Matches
 * the policy in the main window's `will-navigate` guard.
 */
function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? "";
  if (!url) return false;
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl && url.startsWith(devUrl)) return true;
  if (url.startsWith("file://")) return true;
  if (url.startsWith("pond://")) return true;
  return false;
}

/**
 * Drop-in replacement for `ipcMain.handle` that rejects untrusted
 * senders before the handler body runs. Logs the offending URL once
 * so a real navigation bug doesn't fail silently.
 */
function safeHandle<Args extends unknown[], R>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: Args) => R,
): void {
  ipcMain.handle(channel, (event, ...args) => {
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

/**
 * The renderer's only way into the executor. Every handler here is a thin
 * wrapper — the real work lives in `core/executor.ts`.
 */
export function registerIpc() {
  safeHandle(IPC.appInfo, () => {
    // `os.userInfo().username` is the POSIX login on macOS / Linux and
    // the SAM account name on Windows — never the human-friendly full
    // name. The sidebar renders it as the workspace owner; we humanise
    // it lightly (drop dots/dashes/underscores, title-case each token)
    // so common usernames like `raphael.salaja` show up as
    // `Raphael Salaja`.
    let username = "Pond";
    try {
      const raw = userInfo().username;
      if (raw) {
        username = raw
          .split(/[._-]/)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
      }
    } catch {
      // userInfo() can throw on some sandboxed environments — safe to
      // ignore and fall through to the default workspace label.
    }
    return {
      name: "pond",
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      username,
    };
  });

  safeHandle(IPC.tx, async (_, tx: Transaction) => {
    const action = await executeTransaction(tx);
    recordForUndo(tx);
    return action;
  });

  safeHandle(IPC.txBatch, async (_, txs: Transaction[]) => {
    const actions = await executeBatch(txs);
    for (const tx of txs) recordForUndo(tx);
    return actions;
  });

  safeHandle(IPC.undo, async () => {
    const ok = await undo();
    return { ok, canUndo: canUndo(), canRedo: canRedo() };
  });

  safeHandle(IPC.redo, async () => {
    const ok = await redo();
    return { ok, canUndo: canUndo(), canRedo: canRedo() };
  });

  safeHandle(IPC.query, async (event, name: string, params: unknown) => {
    try {
      return await runQuery(name, params, event);
    } catch (err) {
      log.error("[pond ipc] query failed", name, err);
      throw err;
    }
  });

  // Open a URL in the user's default browser. We validate the scheme
  // before handing off to `shell.openExternal` so a compromised
  // renderer can't weaponise this into launching file:// / custom
  // handlers.
  safeHandle(IPC.openExternal, async (_, url: string) => {
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

  safeHandle(IPC.revealSave, async (_, id: string, fileIndex?: number) => {
    const target = await resolveSaveFilePath(id, fileIndex);
    if (!target.ok) return target;
    shell.showItemInFolder(target.path);
    return { ok: true as const };
  });

  safeHandle(IPC.openSaveFile, async (_, id: string, fileIndex?: number) => {
    const target = await resolveSaveFilePath(id, fileIndex);
    if (!target.ok) return target;
    const err = await shell.openPath(target.path);
    if (err) {
      log.warn("[pond ipc] openSaveFile failed", err);
      return { ok: false as const, reason: err };
    }
    return { ok: true as const };
  });

  // In-app metadata refresh. Returns a structured outcome the renderer
  // uses to decide whether to show a success toast, an error toast, or
  // a "Connect <source>" prompt that links into Settings.
  safeHandle(IPC.refreshSave, async (_, id: string) => {
    try {
      return await refreshSave(String(id));
    } catch (err) {
      log.error("[pond ipc] refreshSave failed", err);
      return { ok: false as const, reason: "internal_error" as const };
    }
  });

  // Bulk metadata refresh: walks every existing save (with optional
  // source / missing-only filter) and re-runs the per-save pipeline.
  // Fire-and-forget — progress streams over `IPC.refreshBackfillStatus`.
  safeHandle(
    IPC.refreshBackfillStart,
    async (
      _,
      opts: {
        source?: string | null;
        onlyMissing?: boolean;
      } = {},
    ) => {
      try {
        return await startRefreshBackfill({
          source: (opts?.source ?? null) as Source | null,
          onlyMissing: Boolean(opts?.onlyMissing),
        });
      } catch (err) {
        log.error("[pond ipc] refreshBackfillStart failed", err);
        return { ok: false as const, reason: "already_running" as const };
      }
    },
  );

  safeHandle(IPC.refreshBackfillCancel, async () => {
    cancelRefreshBackfill();
    return { ok: true as const };
  });

  // One-shot status read so a freshly-mounted Settings page can paint
  // the current run state without waiting for the next push event.
  safeHandle(IPC.refreshBackfillStatus, async () => {
    return getRefreshBackfillStatus();
  });

  safeHandle(IPC.sourceConnect, async (_, source: string) => {
    try {
      // `signInToSource` already kicks an incremental sync after the
      // sign-in window closes (when cookies are present), so the IPC
      // handler stays a thin pass-through.
      return await signInToSource(
        source as Parameters<typeof signInToSource>[0],
      );
    } catch (err) {
      log.warn("[pond ipc] sourceConnect failed", err);
      return { ok: false as const };
    }
  });

  safeHandle(IPC.sourceDisconnect, async (_, source: string) => {
    try {
      return await disconnectSource(
        source as Parameters<typeof disconnectSource>[0],
      );
    } catch (err) {
      log.warn("[pond ipc] sourceDisconnect failed", err);
      return { ok: false as const };
    }
  });

  safeHandle(IPC.sourceStatus, async (_, source: string) => {
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

  // Sync IPC. The "Sync now" button and the Cmd+K command palette
  // both fan in here; the orchestrator deduplicates concurrent
  // requests for the same source so a quick double-click can't
  // launch two scrapes.
  safeHandle(IPC.syncRunNow, async (_, source: string) => {
    const src = source as Source;
    if (isSyncing(src)) {
      return { ok: false as const, reason: "already_running" as const };
    }
    // Fire-and-forget so the renderer doesn't block on the full
    // bookmarks scrape; status updates stream over `IPC.syncStatus`.
    void syncSource(src, { trigger: "manual" });
    return { ok: true as const };
  });

  safeHandle(IPC.syncCancel, async (_, source: string) => {
    cancelSync(source as Source);
    return { ok: true as const };
  });

  // One-shot status read so a freshly opened renderer can paint
  // "Last synced 3h ago" without waiting for the next push event.
  safeHandle(IPC.syncStatus, async (_, source: string) => {
    const src = source as Source;
    const cfg = await getSourceSync(src);
    return {
      ok: true as const,
      running: isSyncing(src),
      enabled: cfg.enabled,
      cadence: cfg.cadence,
      lastSyncedAt: cfg.lastSyncedAt,
      lastError: cfg.lastError,
    };
  });

  // Renderer auto-heal: fired when a `<video>` errors. We hand the
  // saveId to the auto-video queue with `force: true`; it re-resolves
  // the source/url and re-runs yt-dlp with the corrected H.264-only
  // selector, overwriting the unplayable bytes. The renderer doesn't
  // need to wait — once the merge tx fires, the pool reconciler
  // pushes the new sha-bumped URL and the card heals on the next
  // commit (the broken state resets when `pickedSrc` changes).
  safeHandle(IPC.videoRedownload, async (_, id: string) => {
    try {
      return await redownloadVideoForSave(String(id));
    } catch (err) {
      log.warn("[pond ipc] videoRedownload failed", err);
      return { ok: false as const, reason: "internal_error" as const };
    }
  });

  safeHandle(IPC.videoToolsStatus, async () => {
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
  safeHandle(IPC.videoToolsReinstall, async () => {
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

  safeHandle(IPC.saveContextMenu, async (event, id: string) => {
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
async function runQuery(
  name: string,
  raw: unknown,
  event?: Electron.IpcMainInvokeEvent,
): Promise<unknown> {
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
    case "saves.find": {
      // Declarative filter pipeline: the renderer ships an AST
      // (`Query`) and we compile it to a single Drizzle WHERE clause
      // via `buildWhere`. Empty queries fall through and return the
      // unfiltered set, mirroring `saves.list`'s behaviour. We always
      // narrow against `deletedAt is null` here so the chip bar's
      // result count matches what the grid actually renders.
      const limit = Math.min(Number(params.limit ?? 1000), 5000);
      const query = (params.query ?? null) as Query | null;
      const where = query ? buildWhere(query) : undefined;
      const rows = where
        ? await db
            .select()
            .from(saves)
            .where(where)
            .orderBy(desc(saves.savedAt))
            .limit(limit)
        : await db
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
    case "saves.dropFiles": {
      // Native drag-and-drop into the window. Renderer hands us a list
      // of `{ path, name, type }` records (Electron exposes `path` on
      // dropped File objects). We turn each into a synthetic local
      // save with the file as its cover, then ingest through the same
      // pipeline that `/api/v2/item/add` uses so the on-disk metadata
      // shape is identical to extension-saved items.
      const items = Array.isArray(params.items)
        ? (params.items as Array<{
            path: string;
            name?: string;
            type?: string;
          }>)
        : [];
      if (items.length === 0) return { ok: false, error: "no_items" };
      const { ingestFromHttp } = await import("../core/ingest");
      const ids: string[] = [];
      // Defense in depth: even though contextIsolation guarantees
      // these paths come from our own renderer, an XSS via untrusted
      // save metadata could otherwise turn this handler into an
      // arbitrary-file-read primitive. Restrict to the OS-managed
      // user directories where browser drops actually originate.
      const allowedRoots = (() => {
        const roots: string[] = [];
        for (const key of [
          "downloads",
          "pictures",
          "documents",
          "desktop",
          "music",
          "videos",
          "home",
        ] as const) {
          try {
            const p = app.getPath(key);
            if (p) roots.push(resolvePath(p));
          } catch {
            /* unsupported on this platform; skip */
          }
        }
        return roots;
      })();
      const isUnderAllowedRoot = (p: string): boolean => {
        const abs = resolvePath(p);
        return allowedRoots.some(
          (root) => abs === root || abs.startsWith(root + pathSep),
        );
      };
      for (const it of items) {
        if (!it.path || !existsSync(it.path)) continue;
        if (!isUnderAllowedRoot(it.path)) {
          log.warn("[pond ipc] dropFiles refused path outside user dirs", {
            path: it.path,
          });
          continue;
        }
        const sid = `drop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const isImage =
          (it.type ?? "").startsWith("image/") ||
          /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(it.path);
        const isVideo =
          (it.type ?? "").startsWith("video/") ||
          /\.(mp4|mov|webm|m4v)$/i.test(it.path);
        try {
          const result = await ingestFromHttp(
            {
              source: "article",
              sourceId: sid,
              url: `file://${it.path}`,
              title: it.name ?? null,
              description: null,
              author: null,
              mediaUrl: null,
              mediaType: isImage ? "image" : isVideo ? "video" : null,
              tags: [],
              raw: { drop: true },
            },
            {
              mediaFiles: [{ path: it.path, mimeType: it.type }],
            },
          );
          ids.push(result.id);
        } catch (err) {
          log.warn("[pond ipc] dropFiles ingest failed", err);
        }
      }
      return { ok: ids.length > 0, ids };
    }
    case "saves.startDrag": {
      // Reverse direction — user drags a card off the grid. We use
      // Electron's `webContents.startDrag` to hand the OS a real file
      // pointer so the drop target (Finder, Mail, Notes, …) sees a
      // proper `file:` payload instead of a blob URL.
      const id = String(params.id ?? "");
      const fileIndex = Number(params.fileIndex ?? 0);
      if (!id || !event) return { ok: false };
      const target = await resolveSaveFilePath(
        id,
        Number.isFinite(fileIndex) ? fileIndex : 0,
      );
      if (!target.ok) return { ok: false };
      try {
        const { nativeImage } = await import("electron");
        const icon = nativeImage.createEmpty();
        event.sender.startDrag({ file: target.path, icon });
        return { ok: true };
      } catch (err) {
        log.warn("[pond ipc] startDrag failed", err);
        return { ok: false };
      }
    }
    case "saves.quickAdd": {
      // Minimal-payload ingest used by the in-app quick-capture window.
      // We synthesise a stub `IngestPayload` and let the refresh
      // harvester top it up with OG/scraper data on next request. URL
      // is required; everything else is optional and best-guessed.
      const url = String(params.url ?? "").trim();
      const note = String(params.note ?? "");
      const tagList = Array.isArray(params.tags)
        ? (params.tags as unknown[]).map((t) => String(t))
        : [];
      if (!url) return { ok: false, error: "no_url" };
      let host = "";
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        return { ok: false, error: "invalid_url" };
      }
      const source = inferSource(host);
      const sourceId = `quick-${Date.now().toString(36)}`;
      const { ingestFromHttp } = await import("../core/ingest");
      try {
        const result = await ingestFromHttp({
          source,
          sourceId,
          url,
          title: null,
          description: note ? note : null,
          author: null,
          mediaUrl: null,
          mediaType: null,
          tags: tagList,
          raw: { quickCapture: true },
        });
        // Fire a non-blocking refresh so OG metadata streams in.
        setImmediate(() => {
          void refreshSave(result.id).catch(() => {
            /* harvester errors are surfaced via the toast on the UI */
          });
        });
        return { ok: true, id: result.id, created: result.created };
      } catch (err) {
        log.error("[pond ipc] quickAdd failed", err);
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
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
    case "settings.getPrefs": {
      return await getPrefs();
    }
    case "settings.setPrefs": {
      const next = await setPrefs(params as Parameters<typeof setPrefs>[0]);
      return { ok: true, prefs: next };
    }
    case "profile.pickAvatar": {
      // Open the OS file picker, copy the chosen image into
      // `<library>/_meta/avatar<ext>`, and write the resolved path
      // into prefs so the renderer can load it via file://.
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: "Pick avatar",
            properties: ["openFile"],
            filters: [
              {
                name: "Images",
                extensions: ["png", "jpg", "jpeg", "gif", "webp"],
              },
            ],
          })
        : await dialog.showOpenDialog({
            title: "Pick avatar",
            properties: ["openFile"],
            filters: [
              {
                name: "Images",
                extensions: ["png", "jpg", "jpeg", "gif", "webp"],
              },
            ],
          });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false as const, reason: "cancelled" as const };
      }
      const src = result.filePaths[0];
      if (!src) return { ok: false as const, reason: "cancelled" as const };
      const meta = resolvePath(libraryRootDir(), "_meta");
      await mkdir(meta, { recursive: true });
      const ext = extname(src).toLowerCase() || ".png";
      const dest = resolvePath(meta, `avatar${ext}`);
      await copyFile(src, dest);
      await setPrefs({ profile: { avatarPath: dest } });
      return { ok: true as const, path: dest };
    }
    case "profile.clearAvatar": {
      await setPrefs({ profile: { avatarPath: null } });
      return { ok: true as const };
    }
    case "settings.setAiGatewayKey": {
      await setAiGatewayKey(String(params.key ?? ""));
      return { ok: true };
    }
    case "library.rescan": {
      return await reconcileLibrary();
    }
    case "library.openInFinder": {
      const root = libraryRootDir();
      const err = await shell.openPath(root);
      if (err) return { ok: false as const, reason: err };
      return { ok: true as const };
    }
    case "library.verifyIntegrity": {
      // Compare on-disk metadata.json files to the SQLite saves index
      // and surface any drift — orphaned items (on disk, not indexed),
      // missing items (indexed, no folder), and mismatched primary
      // file paths. Cheap to run because both sides are bounded.
      try {
        const result = await verifyLibraryIntegrity();
        return { ok: true as const, ...result };
      } catch (err) {
        log.warn("[pond ipc] verifyIntegrity failed", err);
        return {
          ok: false as const,
          reason: err instanceof Error ? err.message : "internal_error",
        };
      }
    }
    case "library.move": {
      // File-picker driven library move. Closes the current SQLite
      // handle, copies (then deletes) the on-disk library, and writes
      // the new path into settings so subsequent boots resolve it. We
      // ask the user to relaunch — moving the index file out from
      // under live IPC handlers is a recipe for partial state.
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const dialogOpts = {
        title: "Pick a new location for your Pond library",
        properties: ["openDirectory" as const, "createDirectory" as const],
      };
      const result = win
        ? await dialog.showOpenDialog(win, dialogOpts)
        : await dialog.showOpenDialog(dialogOpts);
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false as const, reason: "cancelled" as const };
      }
      const dest = result.filePaths[0];
      if (!dest) return { ok: false as const, reason: "cancelled" as const };
      try {
        const moved = await moveLibrary(dest);
        return { ok: true as const, path: moved };
      } catch (err) {
        return {
          ok: false as const,
          reason: err instanceof Error ? err.message : "move_failed",
        };
      }
    }
    case "library.exportZip": {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const dialogOpts = {
        title: "Save library export",
        defaultPath: `pond-library-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: "Zip", extensions: ["zip"] }],
      };
      const result = win
        ? await dialog.showSaveDialog(win, dialogOpts)
        : await dialog.showSaveDialog(dialogOpts);
      if (result.canceled || !result.filePath) {
        return { ok: false as const, reason: "cancelled" as const };
      }
      try {
        const path = await exportLibraryZip(result.filePath);
        return { ok: true as const, path };
      } catch (err) {
        return {
          ok: false as const,
          reason: err instanceof Error ? err.message : "export_failed",
        };
      }
    }
    case "library.exportJson": {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const dialogOpts = {
        title: "Pick a folder for the JSON export",
        properties: ["openDirectory" as const, "createDirectory" as const],
      };
      const result = win
        ? await dialog.showOpenDialog(win, dialogOpts)
        : await dialog.showOpenDialog(dialogOpts);
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false as const, reason: "cancelled" as const };
      }
      const dest = result.filePaths[0];
      if (!dest) return { ok: false as const, reason: "cancelled" as const };
      try {
        const out = await exportLibraryJson(dest);
        return { ok: true as const, path: out };
      } catch (err) {
        return {
          ok: false as const,
          reason: err instanceof Error ? err.message : "export_failed",
        };
      }
    }
    case "trash.emptyOlderThan": {
      const days = Math.max(0, Number(params.days ?? 0));
      const purged = await emptyTrashOlderThan(days);
      return { ok: true as const, purged };
    }
    case "quickCapture.applyPrefs": {
      // Re-applies tray visibility, launch-at-login, and the global
      // capture hotkey from the latest persisted prefs. Renderer
      // calls this after `usePrefs("quickCapture").patch(...)`.
      try {
        const { applyPrefsAtRuntime } = await import("../index");
        await applyPrefsAtRuntime();
        return { ok: true as const };
      } catch (err) {
        log.warn("[pond ipc] applyPrefsAtRuntime failed", err);
        return {
          ok: false as const,
          reason: err instanceof Error ? err.message : "internal_error",
        };
      }
    }
    case "backups.snapshotNow": {
      const { snapshotNow } = await import("../core/backups");
      const snap = await snapshotNow();
      return { ok: true as const, snapshot: snap };
    }
    case "backups.list": {
      const { listSnapshots } = await import("../core/backups");
      return { ok: true as const, snapshots: await listSnapshots() };
    }
    case "backups.reveal": {
      const { listSnapshots } = await import("../core/backups");
      const list = await listSnapshots();
      const target = list.find((s) => s.filename === String(params.filename));
      if (!target) return { ok: false as const, reason: "not_found" as const };
      shell.showItemInFolder(target.path);
      return { ok: true as const };
    }
    case "backups.delete": {
      const { listSnapshots } = await import("../core/backups");
      const list = await listSnapshots();
      const target = list.find((s) => s.filename === String(params.filename));
      if (!target) return { ok: false as const, reason: "not_found" as const };
      const { rm } = await import("node:fs/promises");
      await rm(target.path, { force: true });
      return { ok: true as const };
    }
    case "api.restart": {
      try {
        const { restartHttpServer } = await import("../index");
        const result = await restartHttpServer();
        return { ok: true as const, ...result };
      } catch (err) {
        return {
          ok: false as const,
          reason: err instanceof Error ? err.message : "internal_error",
        };
      }
    }
    case "updates.applyPrefs": {
      try {
        const { applyUpdaterPrefs } = await import("../updater");
        await applyUpdaterPrefs();
        return { ok: true as const };
      } catch (err) {
        return {
          ok: false as const,
          reason: err instanceof Error ? err.message : "internal_error",
        };
      }
    }
    case "updates.checkNow": {
      const { checkForUpdatesNow } = await import("../updater");
      return await checkForUpdatesNow();
    }
    case "developer.openLogs": {
      const logsDir = app.getPath("logs");
      // electron-log seeds the directory the first time it writes,
      // but a freshly installed copy that hasn't logged anything yet
      // would otherwise resolve to a missing path and `openPath`
      // would silently no-op.
      try {
        await mkdir(logsDir, { recursive: true });
      } catch (err) {
        log.warn("[pond ipc] logs mkdir failed", err);
      }
      const err = await shell.openPath(logsDir);
      if (err) return { ok: false as const, reason: err };
      return { ok: true as const };
    }
    case "developer.applyVerboseLogging": {
      const verbose = Boolean(params.verbose);
      log.transports.file.level = verbose ? "debug" : "info";
      log.transports.console.level = verbose ? "debug" : "info";
      return { ok: true as const };
    }
    case "developer.openIpcInspector": {
      // Spawn a tiny BrowserWindow that subscribes to the IPC log
      // stream via a bespoke channel. The inspector itself is a
      // single-page renderer baked into resources/ipc-inspector.html
      // — when that asset is missing (dev) we fall back to opening
      // the log directory so the user still has something useful.
      try {
        const inspector = new BrowserWindow({
          width: 900,
          height: 600,
          title: "Pond IPC inspector",
          webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
          },
        });
        // Inspector is intentionally static — no popups, no
        // navigation, no `<webview>` embeds. Bounce any link clicks
        // to the system browser, deny everything else.
        inspector.webContents.setWindowOpenHandler(({ url }) => {
          if (url.startsWith("http:") || url.startsWith("https:")) {
            void shell.openExternal(url);
          }
          return { action: "deny" };
        });
        inspector.webContents.on("will-navigate", (event, url) => {
          if (!url.startsWith("data:")) {
            event.preventDefault();
            log.warn("[pond ipc] inspector blocked navigation", url);
          }
        });
        await inspector.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(
            `<!doctype html><html><head><title>Pond IPC inspector</title>
              <style>
                body{font:13px ui-sans-serif,system-ui;margin:0;padding:12px;background:#0e0e0f;color:#f5f5f5}
                pre{margin:0;padding:8px 12px;border-bottom:1px solid #222;white-space:pre-wrap;word-break:break-word}
                pre b{color:#7ec0ff}
                .empty{opacity:.6}
              </style></head><body><h2>IPC inspector</h2>
              <p class="empty">Live IPC events stream into the main-process log file. Open the log directory from Settings &rarr; Developer for a tail-able transcript.</p>
              </body></html>`,
          )}`,
        );
        return { ok: true as const };
      } catch (err) {
        log.warn("[pond ipc] inspector failed", err);
        return {
          ok: false as const,
          reason: err instanceof Error ? err.message : "internal_error",
        };
      }
    }
    case "reset.preferences": {
      // Overwrite the prefs blob with defaults but leave the rest of
      // the settings row (aiAutonomy, libraryRoot, etc.) intact —
      // those have their own destructive flow.
      const { DEFAULT_PREFS } = await import("@pond/schema/db");
      await setPrefs(DEFAULT_PREFS);
      return { ok: true as const };
    }
    case "reset.clearVideoCache": {
      const removed = await purgeLibrarySubdir("_video_cache");
      return { ok: true as const, removed };
    }
    case "reset.clearThumbnails": {
      const removed = await purgeLibrarySubdir("_thumbs");
      return { ok: true as const, removed };
    }
    case "reset.factory": {
      // Drops the SQLite DB + the prefs blob. The on-disk
      // metadata.json files are untouched so a fresh launch can
      // re-index them. Renderer is responsible for relaunching the
      // app right after this resolves.
      const dbPath = (await import("../paths")).resolvePaths().indexDb;
      try {
        const { rm } = await import("node:fs/promises");
        await rm(dbPath, { force: true });
      } catch (err) {
        log.warn("[pond reset] db removal failed", err);
      }
      return { ok: true as const };
    }
    case "storage.snapshot": {
      const { getStorageSnapshot } = await import("../core/storage-stats");
      return await getStorageSnapshot();
    }
    case "storage.applyGuardPrefs": {
      const { applyStorageWatcherPrefs } = await import(
        "../core/storage-watcher"
      );
      await applyStorageWatcherPrefs();
      return { ok: true as const };
    }
    case "storage.guardState": {
      const { getStorageGuardState } = await import("../core/storage-watcher");
      return getStorageGuardState();
    }
    case "saves.search": {
      const q = String(params.q ?? "").trim();
      const prefs = await getPrefs();
      const explicitLimit =
        params.limit !== undefined ? Number(params.limit) : undefined;
      const limit = Math.min(
        Number.isFinite(explicitLimit ?? Number.NaN)
          ? Number(explicitLimit)
          : prefs.search.resultLimit,
        2000,
      );
      if (!q) return [];
      // FTS5 will throw on bare punctuation / unbalanced quotes if we
      // pass user input straight through. Sanitize to a quoted prefix
      // query so partial words still match (`pinte` -> `pinte*`).
      const sanitized = sanitizeFtsQuery(q);
      let ftsRows: Array<{ id: string; rank: number }> = [];
      try {
        ftsRows = db.$raw
          .prepare(
            `SELECT id, rank FROM saves_fts WHERE saves_fts MATCH ? ORDER BY rank LIMIT ?`,
          )
          .all(sanitized, limit) as Array<{ id: string; rank: number }>;
      } catch (err) {
        log.warn("[pond search] fts query failed; falling back", err);
        ftsRows = [];
      }
      if (ftsRows.length === 0) {
        // Fallback: simple substring scan against title/description/url.
        const lower = q.toLowerCase();
        const all = await db.select().from(saves);
        const matched = all.filter((r) => {
          const hay = [r.title, r.description, r.author, r.url, r.aiCaption]
            .filter((v): v is string => Boolean(v))
            .join(" ")
            .toLowerCase();
          return hay.includes(lower);
        });
        return toWireSaves(matched.slice(0, limit));
      }
      const ids = ftsRows.map((r) => r.id);
      const rows = await db.select().from(saves);
      const byId = new Map(rows.map((r) => [r.id, r]));
      return toWireSaves(
        ids
          .map((id) => byId.get(id))
          .filter((r): r is NonNullable<typeof r> => !!r),
      );
    }
    case "saves.searchByColor": {
      // Find saves whose dominant colour list contains anything within
      // `tolerance` Manhattan distance of the query hex. Pure SQL would
      // need a UDF for the Manhattan calc, so we filter in JS — fine
      // up to library sizes well past 10k items because we're working
      // out of the in-memory `saves.list` snapshot anyway.
      const hex = String(params.hex ?? "")
        .replace(/^#/, "")
        .toLowerCase();
      const tolerance = Math.max(
        8,
        Math.min(160, Number(params.tolerance ?? 64)),
      );
      const limit = Math.min(Number(params.limit ?? 200), 1000);
      if (hex.length !== 6) return [];
      const wanted = hexToRgb(hex);
      if (!wanted) return [];
      const all = await db.select().from(saves);
      const scored = all
        .map((r) => {
          const cols = (r.dominantColors ?? []) as Array<{
            hex: string;
            weight?: number;
          }>;
          if (!cols.length) return null;
          let best = Number.POSITIVE_INFINITY;
          for (const c of cols) {
            const rgb = hexToRgb(c.hex.replace(/^#/, "").toLowerCase());
            if (!rgb) continue;
            const dist =
              Math.abs(rgb.r - wanted.r) +
              Math.abs(rgb.g - wanted.g) +
              Math.abs(rgb.b - wanted.b);
            if (dist < best) best = dist;
          }
          return Number.isFinite(best) && best <= tolerance
            ? { row: r, score: best }
            : null;
        })
        .filter((x): x is { row: (typeof all)[number]; score: number } => !!x)
        .sort((a, b) => a.score - b.score)
        .slice(0, limit);
      return toWireSaves(scored.map((s) => s.row));
    }
    case "saves.similar": {
      // Vector k-NN around a save's stored embedding. Returns the rows
      // ordered by cosine distance ascending. Skips `id` itself.
      const id = String(params.id ?? "");
      const limit = Math.min(Number(params.limit ?? 12), 100);
      if (!id) return [];
      let neighbours: Array<{ save_id: string; distance: number }> = [];
      try {
        neighbours = db.$raw
          .prepare(
            `SELECT save_id, distance FROM saves_vec
             WHERE embedding MATCH (SELECT embedding FROM saves_vec WHERE save_id = ?)
             ORDER BY distance ASC
             LIMIT ?`,
          )
          .all(id, limit + 1) as Array<{ save_id: string; distance: number }>;
      } catch (err) {
        log.warn("[pond search] saves_vec MATCH failed", err);
        return [];
      }
      const ids = neighbours.map((n) => n.save_id).filter((n) => n !== id);
      if (ids.length === 0) return [];
      const rows = await db.select().from(saves);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered = ids
        .map((nid) => byId.get(nid))
        .filter((r): r is NonNullable<typeof r> => !!r);
      return toWireSaves(ordered);
    }
    case "saves.activity": {
      const id = params.saveId ? String(params.saveId) : null;
      const limit = Math.min(Number(params.limit ?? 50), 500);
      const where = id
        ? db.$raw
            .prepare(
              `SELECT id, batch_id, model_name, model_id, action, data, prev_data, actor, actor_reason, created_at
               FROM sync_actions WHERE model_name = 'save' AND model_id = ?
               ORDER BY id DESC LIMIT ?`,
            )
            .all(id, limit)
        : db.$raw
            .prepare(
              `SELECT id, batch_id, model_name, model_id, action, data, prev_data, actor, actor_reason, created_at
               FROM sync_actions ORDER BY id DESC LIMIT ?`,
            )
            .all(limit);
      return where as unknown[];
    }
    case "tags.create": {
      const { createTag } = await import("../core/tags");
      return await createTag({
        name: String(params.name ?? ""),
        color: params.color ? String(params.color) : null,
        group: params.group ? String(params.group) : null,
      });
    }
    case "tags.update": {
      const { updateTag } = await import("../core/tags");
      const name = String(params.name ?? "");
      const patch = (params.patch as Record<string, unknown>) ?? {};
      return await updateTag(name, patch as Partial<typeof tags.$inferInsert>);
    }
    case "tags.rename": {
      const { renameTag } = await import("../core/tags");
      return await renameTag(
        String(params.from ?? ""),
        String(params.to ?? ""),
      );
    }
    case "tags.merge": {
      const { mergeTags } = await import("../core/tags");
      return await mergeTags(
        String(params.from ?? ""),
        String(params.to ?? ""),
      );
    }
    case "tags.delete": {
      const { deleteTag } = await import("../core/tags");
      return await deleteTag(String(params.name ?? ""));
    }
    case "tags.setForSave": {
      const { setSaveTags } = await import("../core/tags");
      return await setSaveTags(
        String(params.saveId ?? ""),
        Array.isArray(params.tags) ? (params.tags as string[]) : [],
      );
    }
    case "tags.allFromSaves": {
      // Walk every save and return a map of tag -> { count, kind }.
      // Used by the tag manager / sidebar tree before the `tags` table
      // is fully populated. Cheap because the pool already lives in
      // memory in the renderer; this is just the source of truth.
      const all = await db.select().from(saves);
      const counts = new Map<string, { user: number; ai: number }>();
      for (const row of all) {
        if (row.deletedAt) continue;
        for (const t of row.tags ?? []) {
          const key = String(t).toLowerCase();
          const entry = counts.get(key) ?? { user: 0, ai: 0 };
          entry.user += 1;
          counts.set(key, entry);
        }
        for (const t of row.aiTags ?? []) {
          const key = String(t).toLowerCase();
          const entry = counts.get(key) ?? { user: 0, ai: 0 };
          entry.ai += 1;
          counts.set(key, entry);
        }
      }
      return Array.from(counts.entries()).map(([name, c]) => ({
        name,
        userCount: c.user,
        aiCount: c.ai,
      }));
    }
    case "saves.inbox": {
      // Saves whose `aiSuggestions` is non-null and not yet applied.
      // The renderer triages from there.
      const limit = Math.min(Number(params.limit ?? 200), 1000);
      const all = await db.select().from(saves);
      const pending = all.filter((r) => {
        if (r.deletedAt) return false;
        const sug = r.aiSuggestions as {
          tags?: { appliedAt: string | null };
          caption?: { appliedAt: string | null };
          ocr?: { appliedAt: string | null };
          classification?: { appliedAt: string | null };
          summary?: { appliedAt: string | null };
        } | null;
        if (!sug) return false;
        return Object.values(sug).some(
          (s) => s && (s as { appliedAt: string | null }).appliedAt === null,
        );
      });
      return toWireSaves(pending.slice(0, limit));
    }
    case "settings.setAiAutonomy": {
      const next = String(params.tagging ?? "suggest") as
        | "off"
        | "suggest"
        | "auto-apply"
        | "auto";
      const guidance = String(params.additionalGuidance ?? "");
      const allowed = new Set(["off", "suggest", "auto-apply", "auto"]);
      if (!allowed.has(next)) {
        return { ok: false, reason: "invalid_level" };
      }
      const current = await db
        .select()
        .from(settingsTable)
        .where(eq(settingsTable.id, "singleton"));
      const merged: typeof DEFAULT_AI_AUTONOMY = {
        ...(current[0]?.aiAutonomy ?? DEFAULT_AI_AUTONOMY),
        tagging: next,
        additionalGuidance: guidance,
      };
      await db
        .insert(settingsTable)
        .values({
          id: "singleton",
          aiAutonomy: merged,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settingsTable.id,
          set: {
            aiAutonomy: merged,
            updatedAt: new Date(),
          },
        })
        .run();
      return { ok: true, aiAutonomy: merged };
    }
    case "settings.setAiProvider": {
      const { setAiProviderConfig } = await import("../core/prefs");
      const next = await setAiProviderConfig(
        params as Partial<import("@pond/schema/db").AiProviderConfig>,
      );
      return { ok: true, aiProvider: next };
    }
    case "settings.detectOllama": {
      const { detectOllama } = await import("../core/enrich/provider");
      return await detectOllama(String(params.baseUrl ?? ""));
    }
    case "settings.recreateVec": {
      const { recreateVecTable } = await import("../db");
      await recreateVecTable();
      return { ok: true };
    }
    case "enrich.start": {
      const { startEnrich } = await import("../core/enrich");
      const id = params.saveId ? String(params.saveId) : null;
      return await startEnrich(id);
    }
    case "enrich.backfill": {
      const { enqueueBackfill } = await import("../core/enrich");
      return await enqueueBackfill();
    }
    case "enrich.status": {
      const { enrichStatus } = await import("../core/enrich");
      return await enrichStatus();
    }
    case "enrich.applySuggestion": {
      const { applyAiSuggestion } = await import("../core/enrich");
      const id = String(params.saveId ?? "");
      const field = String(params.field ?? "") as
        | "tags"
        | "caption"
        | "ocr"
        | "classification"
        | "summary";
      const accept = Boolean(params.accept ?? true);
      return await applyAiSuggestion(id, field, accept);
    }
    case "ai.gatewayKey": {
      // Alias for `settings.aiGatewayKey` so the AI page can use
      // a single namespace.
      return { key: await getAiGatewayKey() };
    }
    default:
      throw new Error(`unknown query: ${name}`);
  }
}

/**
 * Sanitize free-form user search input into an FTS5 query string.
 * Strips quotes / parentheses / asterisks (FTS5 special chars), turns
 * each token into a prefix match, and AND-joins them so all words must
 * appear somewhere in the indexed columns.
 */
function sanitizeFtsQuery(q: string): string {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return q.replace(/["()*]/g, "");
  return tokens.map((t) => `${t}*`).join(" AND ");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (hex.length !== 6) return null;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
  return { r, g, b };
}

/**
 * Best-guess `Source` from a hostname. Mirrors the extension's
 * classifier so quick-captured URLs land in the same bucket as
 * extension-saved items. Defaults to `"article"` for unrecognised hosts
 * — the refresh harvester will then run OG extraction.
 */
function inferSource(host: string): IngestSource {
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

type IngestSource =
  | "twitter"
  | "instagram"
  | "pinterest"
  | "arena"
  | "cosmos"
  | "tiktok"
  | "youtube"
  | "article";
