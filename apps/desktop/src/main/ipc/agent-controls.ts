import { PrefsSchema, SOURCES } from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import { SETTINGS_SECTIONS } from "@pond/schema/settings";
import { z } from "zod";
import { IPC, type MenuActionId } from "../../shared/constants";
import type { PondOperation } from "../core/agent/operations";
import {
  isAllPaused,
  pauseAll,
  resumeAll,
  resumeSource,
} from "../core/pipeline/rate-governor";
import {
  cancelAllIngest,
  cancelSaveIngest,
  setReconcilerPaused,
} from "../core/pipeline/reconciler-client";
import {
  isSourceConnected,
  refreshSave,
  signInToSource,
} from "../core/refresh";
import {
  archiveSiteForSave,
  startArchiveBackfill,
} from "../core/refresh/archive-backfill";
import {
  cancelRefreshBackfill,
  startRefreshBackfill,
} from "../core/refresh/backfill";
import {
  cancelSync,
  getAccountSync,
  isSyncing,
  syncAccount,
  syncAllSources,
} from "../core/sync";
import { getWatch, getWatchSync } from "../core/sync/watches";
import { canRedo, canUndo, redo, undo } from "../core/undo";
import { watchNow } from "../core/watch/run";
import { broadcast } from "../lib/broadcast";
import { setPendingSessionSource } from "../pending-session";

function operation<Params>(
  name: string,
  description: string,
  access: PondOperation["access"],
  schema: z.ZodType<Params>,
  execute: (params: Params) => Promise<JsonValue>,
): PondOperation {
  return {
    name,
    description,
    access,
    inputSchema: schema,
    execute: async (args) => execute(schema.parse(args)),
  };
}

const empty = z.object({});
const idInput = z.object({ id: z.string().min(1) });
const accountInput = z.object({ accountId: z.string().min(1) });
const sourceInput = z.object({ source: z.enum(SOURCES) });
const pausedInput = z.object({ paused: z.boolean() });
const forceInput = z.object({ forceFull: z.boolean().default(false) });
const nativeFlows = {
  "library.new": "Create a Library",
  "library.open": "Open or switch Libraries",
  "library.move": "Move the Library",
  "library.restore": "Restore a Library backup",
  "library.connect": "Open the New Source menu",
  "library.watch": "Open the New Watch menu",
  "library.connect-pinterest": "Connect Pinterest",
  "library.new-tag": "Create a tag",
  "library.new-tag-group": "Create a tag group",
  "library.import-files": "Import files",
  "library.import-folders": "Import folders",
  "library.import-links": "Import links",
  "library.download": "Open the Download dialog",
  "library.import-clipboard": "Import from the clipboard",
  "library.import-bookmarks": "Import bookmarks",
  "library.import-mymind": "Import a mymind export",
  "library.import-data-export":
    "Import a data export from X, Instagram, TikTok, YouTube, or Reddit",
  "library.import-page-assets": "Import page assets",
  "library.import-eagle": "Import an Eagle library",
  "library.import-package": "Import a package",
  "library.auto-import-folder": "Create a watched folder",
  "library.find-duplicates-all": "Inspect duplicate Saves",
} satisfies Partial<Record<MenuActionId, string>>;
const viewCommands = [
  "history.back",
  "history.forward",
  "library.search",
  "view.inspector.toggle",
  "view.layout.waterfall",
  "view.layout.grid",
  "view.layout.justified",
  "view.layout.list",
  "view.zoom-in",
  "view.zoom-out",
  "view.zoom-reset",
  "view.sidebar.toggle",
  "view.grayscale",
] as const satisfies readonly MenuActionId[];

export const agentControlOperations: PondOperation[] = [
  operation(
    "settings.preferenceSchema",
    "Read valid preference field names and enum choices. Read this and settings.getPrefs before settings.setPrefs; send only requested fields in the patch.",
    "read",
    empty,
    async () =>
      z
        .json()
        .parse(
          z.toJSONSchema(PrefsSchema, { io: "input", unrepresentable: "any" }),
        ),
  ),
  operation(
    "navigation.open",
    "Open Library, Sources, Downloads, Tags, or Settings. Integrations (models) manages provider API keys and MCP credentials through the native UI; never request secrets in chat.",
    "read",
    z.object({
      page: z.enum(["library", "sources", "downloads", "tags", "settings"]),
      section: z
        .enum(SETTINGS_SECTIONS.map((section) => section.path))
        .optional(),
    }),
    async ({ page, section }) => {
      const path =
        page === "library"
          ? "/"
          : page === "settings"
            ? `/settings/${section ?? "general"}`
            : `/${page}`;
      broadcast(IPC.nav, path);
      return { dispatched: true, path };
    },
  ),
  operation(
    "navigation.view",
    "Change the current Library layout, zoom, sidebar, inspector, grayscale, or navigate back/forward. Dispatches the existing interface command.",
    "read",
    z.object({ command: z.enum(viewCommands) }),
    async ({ command }) => {
      broadcast(IPC.menuAction, { id: command, source: "automation" });
      return { dispatched: true, command };
    },
  ),
  ...Object.entries(nativeFlows).map(([command, label]) =>
    operation(
      `navigation.${command}`,
      `${label} using Pond's existing dialog. Returns immediately after opening the flow; the user completes the native dialog. Library transitions restart Pond and end the active chat. Do not claim the operation is finished.`,
      "read",
      empty,
      async () => {
        broadcast(IPC.menuAction, { id: command, source: "automation" });
        return { dispatched: true, awaitingUser: true };
      },
    ),
  ),
  operation(
    "history.status",
    "Read whether Pond has an operation available to Undo or Redo.",
    "read",
    empty,
    async () => ({ canUndo: canUndo(), canRedo: canRedo() }),
  ),
  operation(
    "history.undo",
    "Undo the latest operation recorded in Pond's global Undo history. Read history.status first; applies to the latest app action, not necessarily an Assistant action.",
    "review",
    empty,
    async () => ({ ok: await undo(), canUndo: canUndo(), canRedo: canRedo() }),
  ),
  operation(
    "history.redo",
    "Redo the latest undone operation in Pond's global history.",
    "review",
    empty,
    async () => ({ ok: await redo(), canUndo: canUndo(), canRedo: canRedo() }),
  ),
  operation(
    "pipeline.setPaused",
    "Pause or resume processing and downloads.",
    "review",
    pausedInput,
    async ({ paused }) => ({ paused: await setReconcilerPaused(paused) }),
  ),
  operation(
    "pipeline.cancelSave",
    "Cancel processing and downloads for one Save.",
    "review",
    idInput,
    async ({ id }) => ({ cancelled: await cancelSaveIngest(id) }),
  ),
  operation(
    "pipeline.cancelAll",
    "Cancel all queued and active processing and downloads.",
    "review",
    empty,
    async () => ({ cancelled: await cancelAllIngest() }),
  ),
  operation(
    "sync.status",
    "Read current sync status and last error for an account or watched collection. Use accounts.list or watches.list for IDs.",
    "read",
    accountInput,
    async ({ accountId }) => {
      const config = (await getWatch(accountId))
        ? await getWatchSync(accountId)
        : await getAccountSync(accountId);
      return {
        running: isSyncing(accountId),
        lastSyncedAt: config.lastSyncedAt,
        lastError: config.lastError,
      };
    },
  ),
  operation(
    "sync.runNow",
    "Start syncing an account or watched collection. Returns when scheduled; check sync.status for completion.",
    "review",
    accountInput.and(forceInput),
    async ({ accountId, forceFull }): Promise<JsonValue> => {
      if (isSyncing(accountId)) return { ok: false, reason: "already_running" };
      if (await getWatch(accountId))
        void watchNow(accountId, { trigger: "manual" });
      else void syncAccount(accountId, { trigger: "manual", forceFull });
      return { scheduled: true };
    },
  ),
  operation(
    "sync.runAll",
    "Start syncing all sources. Returns when scheduled; use sync status/history to check completion.",
    "review",
    forceInput,
    async ({ forceFull }) => {
      void syncAllSources({ trigger: "manual", forceFull });
      return { scheduled: true };
    },
  ),
  operation(
    "sync.cancel",
    "Cancel syncing an account or watched collection.",
    "review",
    accountInput,
    async ({ accountId }) => {
      const running = isSyncing(accountId);
      cancelSync(accountId);
      return { cancelled: running };
    },
  ),
  operation(
    "sync.setPaused",
    "Pause or resume source harvesting globally.",
    "review",
    pausedInput,
    async ({ paused }) => {
      if (paused) pauseAll();
      else resumeAll();
      return { paused: isAllPaused() };
    },
  ),
  operation(
    "sync.resumeSource",
    "Resume a paused source through Pond's rate governor.",
    "review",
    sourceInput,
    async ({ source }) => {
      resumeSource(source);
      return { ok: true };
    },
  ),
  operation(
    "sources.connectionStatus",
    "Check whether a source has a signed-in browser session.",
    "read",
    sourceInput,
    async ({ source }) => ({ connected: await isSourceConnected(source) }),
  ),
  operation(
    "sources.connect",
    "Open a source sign-in flow. The user signs in through the native browser window; credentials never go through chat. Opening the flow does not mean sign-in completed.",
    "read",
    sourceInput,
    async ({ source }) => {
      setPendingSessionSource(source);
      return signInToSource(source);
    },
  ),
  operation(
    "refresh.save",
    "Refresh downloaded files and metadata for a Save.",
    "review",
    idInput,
    async ({ id }) => refreshSave(id),
  ),
  operation(
    "refresh.start",
    "Refresh Library content, optionally limited to one source or missing content. Returns job scheduling information.",
    "review",
    z.object({
      source: z.enum(SOURCES).nullable().default(null),
      onlyMissing: z.boolean().default(true),
      overwrite: z.boolean().default(false),
    }),
    async (params) => startRefreshBackfill(params),
  ),
  operation(
    "refresh.cancel",
    "Cancel the Library refresh job.",
    "review",
    empty,
    async () => {
      cancelRefreshBackfill();
      return { ok: true };
    },
  ),
  operation(
    "archive.save",
    "Archive a Save's original web page for offline viewing.",
    "review",
    idInput,
    async ({ id }) => archiveSiteForSave(id),
  ),
  operation(
    "archive.start",
    "Start archiving Library web pages for offline viewing.",
    "review",
    empty,
    async () => startArchiveBackfill(),
  ),
];
