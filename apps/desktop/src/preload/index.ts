import type { Prefs } from "@pond/schema";
import type { Query } from "@pond/schema/filters/types";
import type { Transaction } from "@pond/schema/tx";
import {
  contextBridge,
  type IpcRendererEvent,
  ipcRenderer,
  webUtils,
} from "electron";
import type { AgentStreamEvent } from "../shared/agent-stream";
import type { AssistantChunk } from "../shared/assistant";
import {
  COMBINE_IMAGES_WINDOW_IPC,
  type CombineImagesWindowOpen,
} from "../shared/combine-images-contracts";
import {
  IPC,
  type MenuActionEvent,
  type RecentMenuEntry,
} from "../shared/constants";
import { FilterQuery } from "../shared/filter-query";
import type { FishEvent, FishOpen } from "../shared/fish-contracts";
import {
  type MachinePaceWire,
  MachinePaceWireSchema,
} from "../shared/machine-pace";
import type {
  PreviewNeighborRequest,
  PreviewWindowConfigure,
  PreviewWindowNavigate,
  PreviewWindowOpen,
  PreviewWindowOpenResult,
} from "../shared/preview-window-contracts";
import type { QueryClient } from "../shared/query-contracts";
import type { EagleImportProgress } from "../shared/saves-import-contracts";
import {
  SHELL_HINT_ARG,
  type ShellHint,
  ShellHintSchema,
} from "../shared/shell-hint";
import type { ShortcutId } from "../shared/shortcuts";
import {
  type UpdateNotice,
  type UpdateNoticeInput,
  UpdateNoticeSchema,
} from "../shared/update-notice";

import type {
  WireJson,
  WireSessionImported,
  WireSessionImportFailed,
  WireSyncAction,
  WireSyncStatusUpdate,
  WireUndoState,
} from "../shared/wire";
import { createNavigationMailbox } from "./navigation";

const navigation = createNavigationMailbox();
ipcRenderer.on(IPC.nav, (_: IpcRendererEvent, path: string) =>
  navigation.receive(path),
);
/** Files dropped on the Dock icon can arrive before the renderer subscribes. */
const openFiles = createNavigationMailbox<string[]>();
ipcRenderer.on(IPC.openFiles, (_: IpcRendererEvent, paths: string[]) =>
  openFiles.receive(paths),
);
/** A reload in full screen reports the state before React subscribes. */
const fullScreen = createNavigationMailbox<boolean>();
ipcRenderer.on(IPC.windowFullScreen, (_: IpcRendererEvent, on: boolean) =>
  fullScreen.receive(on),
);
/** A browser capture for a fish can open the window before the renderer subscribes. */
const fishOpen = createNavigationMailbox<FishOpen>();
ipcRenderer.on(IPC.fishOpen, (_: IpcRendererEvent, open: FishOpen) =>
  fishOpen.receive(open),
);

const query: QueryClient = (name, ...args) =>
  ipcRenderer.invoke(IPC.query, name, args[0]);

export interface RelocatePreviewWire {
  currentPath: string;
  candidatePath: string;
  samePath: boolean;
  safety: { ok: boolean; reason: string | null };
  cloudKind: string | null;
  existing: {
    exists: boolean;
    hasItemsDir: boolean;
    hasMetadataFile: boolean;
    itemCount: number;
    looksLikePondLibrary: boolean;
  };
  suggestedMode: "copy" | "adopt";
}

export interface StorageGuardStatusWire {
  state: "ok" | "warn" | "exceeded";
  pondBytes: number;
  capBytes: number | null;
  warnBytes: number | null;
  action: "warn" | "pauseSync" | "pauseVideo";
  appliedAt: string;
}

let cachedLibraryId: string | null = null;

const api = {
  openCombineImagesWindow(input: CombineImagesWindowOpen): Promise<void> {
    return ipcRenderer.invoke(COMBINE_IMAGES_WINDOW_IPC.open, input);
  },
  onFullScreenChange(callback: (fullScreen: boolean) => void): () => void {
    return fullScreen.subscribe(callback);
  },
  onPrefsChanged(callback: (prefs: Prefs) => void): () => void {
    const listener = (_event: IpcRendererEvent, prefs: Prefs) =>
      callback(prefs);
    ipcRenderer.on(IPC.prefsChanged, listener);
    return () => ipcRenderer.off(IPC.prefsChanged, listener);
  },
  tx(tx: Transaction): Promise<void> {
    return ipcRenderer.invoke(IPC.tx, tx);
  },

  libraryId(): string {
    if (cachedLibraryId) return cachedLibraryId;
    try {
      const value: string = ipcRenderer.sendSync(IPC.libraryId);
      cachedLibraryId = value.length > 0 ? value : "unbound";
    } catch {
      cachedLibraryId = "unbound";
    }
    return cachedLibraryId;
  },

  batch(txs: Transaction[]): Promise<void> {
    return ipcRenderer.invoke(IPC.txBatch, txs);
  },

  undo(): Promise<WireUndoState> {
    return ipcRenderer.invoke(IPC.undo);
  },

  redo(): Promise<WireUndoState> {
    return ipcRenderer.invoke(IPC.redo);
  },

  query,

  openPreviewWindow(
    input: PreviewWindowOpen,
  ): Promise<PreviewWindowOpenResult> {
    return ipcRenderer.invoke(IPC.previewOpen, input);
  },

  configurePreviewWindow(input: PreviewWindowConfigure): Promise<void> {
    return ipcRenderer.invoke(IPC.previewConfigure, input);
  },

  navigatePreviewWindow(input: PreviewWindowNavigate): Promise<void> {
    return ipcRenderer.invoke(IPC.previewNavigate, input);
  },

  closePreviewWindow(windowId: number): Promise<void> {
    return ipcRenderer.invoke(IPC.previewClose, windowId);
  },

  onPreviewNeighborRequested(
    callback: (request: PreviewNeighborRequest) => void,
  ): () => void {
    const listener = (_: IpcRendererEvent, request: PreviewNeighborRequest) =>
      callback(request);
    ipcRenderer.on(IPC.previewNeighborRequest, listener);
    return () => ipcRenderer.off(IPC.previewNeighborRequest, listener);
  },

  rendererReady(): void {
    ipcRenderer.send(IPC.rendererReady);
  },

  /** Electron 41 removed File.path; resolve dropped/picked files here so main can read them without the bytes crossing IPC. */
  pathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },

  onSyncAction(cb: (action: WireSyncAction) => void): () => void {
    const listener = (_: IpcRendererEvent, action: WireSyncAction) =>
      cb(action);
    ipcRenderer.on(IPC.syncAction, listener);
    return () => ipcRenderer.off(IPC.syncAction, listener);
  },

  onNavigate(cb: (path: string) => void): () => void {
    return navigation.subscribe(cb);
  },

  onOpenFiles(cb: (paths: string[]) => void): () => void {
    return openFiles.subscribe(cb);
  },

  onEditUndoRequested(cb: () => void): () => void {
    const listener = () => cb();
    ipcRenderer.on(IPC.editUndoRequested, listener);
    return () => ipcRenderer.off(IPC.editUndoRequested, listener);
  },

  onEditRedoRequested(cb: () => void): () => void {
    const listener = () => cb();
    ipcRenderer.on(IPC.editRedoRequested, listener);
    return () => ipcRenderer.off(IPC.editRedoRequested, listener);
  },

  onMenuAction(cb: (action: MenuActionEvent) => void): () => void {
    const listener = (_: IpcRendererEvent, action: MenuActionEvent) =>
      cb(action);
    ipcRenderer.on(IPC.menuAction, listener);
    return () => ipcRenderer.off(IPC.menuAction, listener);
  },

  onShortcutAction(cb: (id: ShortcutId) => void): () => void {
    const listener = (_: IpcRendererEvent, id: ShortcutId) => cb(id);
    ipcRenderer.on(IPC.shortcutAction, listener);
    return () => ipcRenderer.off(IPC.shortcutAction, listener);
  },

  sendMenuRecents(entries: RecentMenuEntry[]): void {
    ipcRenderer.send(IPC.menuRecents, entries);
  },

  onMenuOpenSave(cb: (id: string) => void): () => void {
    const listener = (_: IpcRendererEvent, id: string) => cb(id);
    ipcRenderer.on(IPC.menuOpenSave, listener);
    return () => ipcRenderer.off(IPC.menuOpenSave, listener);
  },

  onEagleImportProgress(
    cb: (progress: EagleImportProgress) => void,
  ): () => void {
    const listener = (_: IpcRendererEvent, progress: EagleImportProgress) =>
      cb(progress);
    ipcRenderer.on(IPC.eagleImportProgress, listener);
    return () => ipcRenderer.off(IPC.eagleImportProgress, listener);
  },

  appInfo(): Promise<{
    name: string;
    version: string;
    platform: string;
    arch: string;
    username: string;
    isPackaged: boolean;
  }> {
    return ipcRenderer.invoke(IPC.appInfo);
  },

  openExternal(url: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.openExternal, url);
  },

  revealSave(
    id: string,
    fileIndex?: number,
  ): Promise<{ ok: boolean; reason?: string }> {
    return ipcRenderer.invoke(IPC.revealSave, id, fileIndex);
  },

  openSaveFile(
    id: string,
    fileIndex?: number,
  ): Promise<{ ok: boolean; reason?: string }> {
    return ipcRenderer.invoke(IPC.openSaveFile, id, fileIndex);
  },

  refreshSave(id: string): Promise<
    | { ok: true; method: "og" | "hidden-window"; created: boolean }
    | {
        ok: false;
        reason:
          | "not_found"
          | "no_url"
          | "no_metadata"
          | "auth_required"
          | "blocked"
          | "internal_error";
        source?: string;
      }
  > {
    return ipcRenderer.invoke(IPC.refreshSave, id);
  },

  refreshBackfillStart(opts?: {
    source?: string | null;
    onlyMissing?: boolean;
    overwrite?: boolean;
  }): Promise<
    | { ok: true; total: number }
    | { ok: false; reason: "already_running" | "no_saves" }
  > {
    return ipcRenderer.invoke(IPC.refreshBackfillStart, opts ?? {});
  },

  refreshBackfillCancel(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.refreshBackfillCancel);
  },

  pipelinePause(paused: boolean): Promise<{ ok: true; paused: boolean }> {
    return ipcRenderer.invoke(IPC.pipelinePause, paused);
  },

  pipelineCancelSaves(
    ids: readonly string[],
  ): Promise<{ ok: true; cancelled: number }> {
    return ipcRenderer.invoke(IPC.pipelineCancelSaves, ids);
  },

  pipelineCancelAll(): Promise<{ ok: true; cancelled: number }> {
    return ipcRenderer.invoke(IPC.pipelineCancelAll);
  },

  connectSource(source: string): Promise<{ ok: boolean; mode: "external" }> {
    return ipcRenderer.invoke(IPC.sourceConnect, source);
  },

  connectSourceHandle(
    source: string,
    handle: string,
  ): Promise<
    | { ok: true; accountId: string }
    | { ok: false; reason: "invalid" | "not_found" | "unavailable" }
  > {
    return ipcRenderer.invoke(IPC.sourceConnectHandle, source, handle);
  },

  clearPendingSession(source?: string): Promise<{ ok: true }> {
    return ipcRenderer.invoke(IPC.sessionPendingClear, source);
  },

  sourceStatus(source: string): Promise<{ ok: boolean; connected: boolean }> {
    return ipcRenderer.invoke(IPC.sourceStatus, source);
  },

  syncRunNow(
    accountId: string,
    opts?: { forceFull?: boolean },
  ): Promise<{ ok: true } | { ok: false; reason: "already_running" }> {
    return ipcRenderer.invoke(IPC.syncRunNow, accountId, opts);
  },

  syncStatus(accountId: string): Promise<{
    ok: boolean;
    running: boolean;
    lastSyncedAt: string | null;
    lastError: string | null;
  }> {
    return ipcRenderer.invoke(IPC.syncStatus, accountId);
  },

  syncRunAll(opts?: { forceFull?: boolean }): Promise<{ ok: true }> {
    return ipcRenderer.invoke(IPC.syncRunAll, opts);
  },

  syncCancel(accountId: string): Promise<{ ok: true; running: boolean }> {
    return ipcRenderer.invoke(IPC.syncCancel, accountId);
  },

  onSessionImported(cb: (payload: WireSessionImported) => void): () => void {
    const listener = (_: IpcRendererEvent, payload: WireSessionImported) =>
      cb(payload);
    ipcRenderer.on(IPC.sessionImported, listener);
    return () => ipcRenderer.off(IPC.sessionImported, listener);
  },

  onSessionImportFailed(
    cb: (payload: WireSessionImportFailed) => void,
  ): () => void {
    const listener = (_: IpcRendererEvent, payload: WireSessionImportFailed) =>
      cb(payload);
    ipcRenderer.on(IPC.sessionImportFailed, listener);
    return () => ipcRenderer.off(IPC.sessionImportFailed, listener);
  },

  machinePace(): Promise<MachinePaceWire> {
    return ipcRenderer
      .invoke(IPC.machinePace)
      .then((payload) => MachinePaceWireSchema.parse(payload));
  },

  onMachinePace(cb: (pace: MachinePaceWire) => void): () => void {
    const listener = (_: IpcRendererEvent, payload: MachinePaceWire) => {
      cb(MachinePaceWireSchema.parse(payload));
    };
    ipcRenderer.on(IPC.machinePaceChanged, listener);
    return () => ipcRenderer.off(IPC.machinePaceChanged, listener);
  },

  onSyncStatus(cb: (update: WireSyncStatusUpdate) => void): () => void {
    const listener = (_: IpcRendererEvent, update: WireSyncStatusUpdate) =>
      cb(update);
    ipcRenderer.on(IPC.syncStatus, listener);
    return () => ipcRenderer.off(IPC.syncStatus, listener);
  },

  onStorageStatus(cb: (status: StorageGuardStatusWire) => void): () => void {
    const listener = (_: IpcRendererEvent, status: StorageGuardStatusWire) =>
      cb(status);
    ipcRenderer.on(IPC.storageStatus, listener);
    return () => ipcRenderer.off(IPC.storageStatus, listener);
  },

  onUpdateNotice(cb: (notice: UpdateNotice) => void): () => void {
    const listener = (_: IpcRendererEvent, payload: UpdateNoticeInput) =>
      cb(UpdateNoticeSchema.parse(payload));
    ipcRenderer.on(IPC.updateNotice, listener);
    return () => ipcRenderer.off(IPC.updateNotice, listener);
  },

  governorSetPaused(
    paused: boolean,
  ): Promise<{ ok: true; allPaused: boolean }> {
    return ipcRenderer.invoke(IPC.governorSetPaused, paused);
  },

  governorResumeSource(source: string): Promise<{ ok: true }> {
    return ipcRenderer.invoke(IPC.governorResumeSource, source);
  },

  onArchiveNavigate(
    cb: (payload: { guestId: number; url: string }) => void,
  ): () => void {
    const listener = (
      _: IpcRendererEvent,
      payload: { guestId: number; url: string },
    ) => cb(payload);
    ipcRenderer.on(IPC.archiveNavigate, listener);
    return () => ipcRenderer.off(IPC.archiveNavigate, listener);
  },

  archiveBackfillStart(): Promise<{ ok: true; queued: number }> {
    return ipcRenderer.invoke(IPC.archiveBackfillStart);
  },
  archiveSite(id: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.archiveSite, id);
  },

  onAgentChunk(cb: (chunk: AssistantChunk) => void): () => void {
    const listener = (_: IpcRendererEvent, chunk: AssistantChunk) => cb(chunk);
    ipcRenderer.on(IPC.agentChunk, listener);
    return () => ipcRenderer.off(IPC.agentChunk, listener);
  },

  onFish(cb: (event: FishEvent) => void): () => void {
    const listener = (_: IpcRendererEvent, event: FishEvent) => cb(event);
    ipcRenderer.on(IPC.fish, listener);
    return () => ipcRenderer.off(IPC.fish, listener);
  },

  onFishOpen(cb: (open: FishOpen) => void): () => void {
    return fishOpen.subscribe(cb);
  },

  agentStream(
    body: WireJson,
    receive: (event: AgentStreamEvent) => void,
  ): () => void {
    const { port1, port2 } = new MessageChannel();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      port1.onmessage = null;
      port1.onmessageerror = null;
      port1.close();
    };
    port1.onmessage = (event) => {
      if (closed) return;
      const chunk = event.data;
      if (chunk instanceof Uint8Array) {
        receive({ type: "data", data: Array.from(chunk) });
      } else if (chunk instanceof ArrayBuffer) {
        receive({ type: "data", data: Array.from(new Uint8Array(chunk)) });
      }
    };
    port1.addEventListener("close", () => {
      if (closed) return;
      close();
      receive({ type: "end" });
    });
    port1.onmessageerror = () => {
      close();
      receive({ type: "error", error: "Could not read this reply." });
    };
    try {
      ipcRenderer.postMessage(IPC.agentStream, body, [port2]);
    } catch (error) {
      close();
      port2.close();
      throw error;
    }
    return close;
  },

  onAgentFilter(cb: (query: Query) => void): () => void {
    const listener = (_: IpcRendererEvent, query: WireJson) => {
      const parsed = FilterQuery.safeParse(query);
      if (parsed.success) cb(parsed.data);
    };
    ipcRenderer.on(IPC.agentFilter, listener);
    return () => ipcRenderer.off(IPC.agentFilter, listener);
  },

  onAgentCite(cb: (ids: string[]) => void): () => void {
    const listener = (_: IpcRendererEvent, ids: string[]) => cb(ids);
    ipcRenderer.on(IPC.agentCite, listener);
    return () => ipcRenderer.off(IPC.agentCite, listener);
  },

  onAgentOverlay(
    cb: (overlay: {
      semanticQuery?: string | null;
      visualSaveId?: string | null;
    }) => void,
  ): () => void {
    const listener = (
      _: IpcRendererEvent,
      overlay: {
        semanticQuery?: string | null;
        visualSaveId?: string | null;
      },
    ) => cb(overlay);
    ipcRenderer.on(IPC.agentOverlay, listener);
    return () => ipcRenderer.off(IPC.agentOverlay, listener);
  },
};

function readShellHint(): ShellHint {
  const arg = process.argv.find((a) => a.startsWith(SHELL_HINT_ARG));
  if (!arg) return {};
  try {
    const parsed = ShellHintSchema.safeParse(
      JSON.parse(arg.slice(SHELL_HINT_ARG.length)),
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

try {
  contextBridge.exposeInMainWorld("pond", api);
  contextBridge.exposeInMainWorld("__pondShell", readShellHint());
} catch (err) {
  console.error("[pond preload] contextBridge failed", err);
}

export type PondApi = typeof api;
