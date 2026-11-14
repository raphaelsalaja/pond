import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { IPC } from "../../../shared/constants";
import type { QueryResult } from "../../../shared/query-contracts";
import { importBookmarkFile, parseBookmarkFile } from "../../core/bookmarks";
import {
  dryRunEagleLibrary,
  importEagleLibrary,
} from "../../core/eagle-import";
import { readEagleShortcuts } from "../../core/eagle-shortcuts";
import { createManualSave } from "../../core/manual-import";
import { importMymindExport } from "../../core/mymind-import";
import { extractPageAssets } from "../../core/page-extract";
import { persistSave } from "../../core/persist-save";
import { enqueue, normalizeUrl } from "../../core/pipeline/enqueue";
import { classifyUrlToSource } from "../../core/pipeline/extractors";
import { UnsupportedError } from "../../core/pipeline/extractors/errors";
import { setPrefs } from "../../core/prefs";
import { setSaveTags } from "../../core/tags";
import { type QueryHandlerMap, query, StringParam } from "./params";
import {
  normalizeQuickAddInput,
  QuickAddParamsSchema,
} from "./saves-import-input";

const EAGLE_IMPORT_PROGRESS_INTERVAL_MS = 100;

export const savesImportSourceQueries = {
  "saves.classifyUrl": query(z.object({ url: StringParam }), (params) => {
    const url = params.url.trim();
    if (!url) return { source: null };
    const { source } = classifyUrlToSource(normalizeUrl(url));
    return { source };
  }),

  async "saves.pickEagleLibrary"(): Promise<
    QueryResult<"saves.pickEagleLibrary">
  > {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const options = {
      properties: ["openDirectory" as const],
      message: "Choose an Eagle library folder",
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const path = result.filePaths[0];
    if (result.canceled || !path) return { ok: false, reason: "cancelled" };
    return { ok: true, path };
  },

  "saves.importEagleLibrary": query(
    z.object({
      path: StringParam,
      dryRun: z.boolean().optional(),
      importShortcuts: z.boolean().optional(),
      progressId: z.string().optional(),
    }),
    async (params, event): Promise<QueryResult<"saves.importEagleLibrary">> => {
      const path = params.path.trim();
      const discovery = await readEagleShortcuts(
        join(app.getPath("appData"), "Eagle", "Settings"),
      );
      const shortcutSummary = {
        status: discovery.status,
        importable: Object.keys(discovery.overrides).length,
        imported: 0,
      };
      if (!path) {
        return {
          ok: false,
          error: "no_path",
          imported: 0,
          skipped: 0,
          failed: 0,
          deletedSkipped: 0,
          lockedFolders: [],
          droppedFields: [],
          approximatedRules: [],
          shortcuts: shortcutSummary,
        };
      }
      if (params.dryRun) {
        return {
          ...(await dryRunEagleLibrary(path)),
          shortcuts: shortcutSummary,
        };
      }
      const progressId = params.progressId?.trim();
      let lastProgressAt = 0;
      const result = await importEagleLibrary(path, {
        onProgress:
          progressId && event
            ? (progress) => {
                const now = Date.now();
                if (
                  progress.processed > 0 &&
                  progress.processed < progress.total &&
                  now - lastProgressAt < EAGLE_IMPORT_PROGRESS_INTERVAL_MS
                ) {
                  return;
                }
                lastProgressAt = now;
                if (!event.sender.isDestroyed()) {
                  event.sender.send(IPC.eagleImportProgress, {
                    id: progressId,
                    ...progress,
                  });
                }
              }
            : undefined,
      });
      if (
        !params.importShortcuts ||
        !result.ok ||
        shortcutSummary.importable === 0
      ) {
        return { ...result, shortcuts: shortcutSummary };
      }
      try {
        await setPrefs({
          shortcuts: {
            profile: "eagle",
            overrides: discovery.overrides,
          },
        });
        return {
          ...result,
          shortcuts: {
            ...shortcutSummary,
            imported: shortcutSummary.importable,
          },
        };
      } catch {
        return {
          ...result,
          shortcuts: { ...shortcutSummary, status: "apply_failed" as const },
        };
      }
    },
  ),

  "saves.quickAdd": query(
    QuickAddParamsSchema,
    async (params): Promise<QueryResult<"saves.quickAdd">> => {
      const { url, note, tags } = normalizeQuickAddInput(params);

      if (!url) {
        const result = await createManualSave({
          title: note,
          note,
          tags,
          inboxChannel: "captures",
        });
        return result.ok
          ? { ok: true, id: result.id }
          : { ok: false, error: result.error };
      }
      try {
        const result = await enqueue(url, { trigger: "user:quickAdd" });
        if (tags.length > 0) await setSaveTags(result.id, tags);
        if (note) {
          await persistSave(
            result.id,
            { notes: note },
            { actorReason: "user:quickAdd-note" },
          );
        }
        return { ok: true, id: result.id, created: result.created };
      } catch (error) {
        if (error instanceof UnsupportedError) {
          const result = await createManualSave({
            url,
            title: note ?? url,
            note,
            tags,
            inboxChannel: "captures",
          });
          return result.ok
            ? { ok: true, id: result.id }
            : { ok: false, error: "unsupported_url" };
        }
        log.error("[pond ipc] quickAdd failed", error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  ),

  async "saves.importBookmarks"(): Promise<
    QueryResult<"saves.importBookmarks">
  > {
    const win = BrowserWindow.getFocusedWindow();
    const options = {
      properties: ["openFile" as const],
      message: "Choose a bookmark export or a Chromium Bookmarks file",
      filters: [
        { name: "Bookmarks", extensions: ["html", "htm", "json"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return { ok: false, reason: "cancelled" };
    const file = parseBookmarkFile(await readFile(path, "utf8"));
    if (!file?.bookmarks.length)
      return {
        ok: false,
        error:
          "That file has no web bookmarks. Export bookmarks as HTML from your browser and try again.",
      };
    return importBookmarkFile(file);
  },

  async "saves.importMymind"(): Promise<QueryResult<"saves.importMymind">> {
    const win = BrowserWindow.getFocusedWindow();
    const options = {
      properties: ["openDirectory" as const],
      message: "Choose your mymind export folder",
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return { ok: false, reason: "cancelled" };
    return importMymindExport(path);
  },

  async "saves.importDataExport"(): Promise<
    QueryResult<"saves.importDataExport">
  > {
    const win = BrowserWindow.getFocusedWindow();
    const darwin = process.platform === "darwin";
    const options: Electron.OpenDialogOptions = {
      /** Only macOS lets one dialog pick either a file or a folder. */
      properties: darwin ? ["openFile", "openDirectory"] : ["openFile"],
      message: darwin
        ? "Choose the .zip or folder you downloaded from X, Instagram, TikTok, Google Takeout, or Reddit"
        : "Choose the .zip you downloaded from X, Instagram, TikTok, Google Takeout, or Reddit",
      filters: [{ name: "Data Export", extensions: ["zip"] }],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return { ok: false, reason: "cancelled" };
    const { importDataExport } = await import("../../core/data-export");
    return importDataExport(path);
  },

  "saves.extractPageAssets": query(
    z.object({ url: StringParam }),
    async (params): Promise<QueryResult<"saves.extractPageAssets">> => {
      const url = params.url.trim();
      if (!url) return { ok: false, imported: 0, skipped: 0, error: "empty" };
      return extractPageAssets(url);
    },
  ),
} satisfies QueryHandlerMap;
