import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/constants";
import type { SuggestionPayload, SuggestionResult } from "../shared/suggestion";

export interface RefreshBackfillStatusWire {
  state: "idle" | "running" | "done" | "error" | "cancelled";
  total: number;
  current: number;
  succeeded: number;
  failed: number;
  authRequired: string[];
  startedAt: string | null;
  finishedAt: string | null;
  options: { source?: string | null; onlyMissing?: boolean };
  message?: string;
}

export interface StorageGuardStatusWire {
  state: "ok" | "warn" | "exceeded";
  pondBytes: number;
  capBytes: number | null;
  warnBytes: number | null;
  action: "warn" | "pauseSync" | "pauseVideo";
  appliedAt: string;
}

export interface ProcessingProgressWire {
  state: "idle" | "running" | "done" | "error" | "cancelled";
  total: number;
  current: number;
  recovered: number;
  stillFailed: number;
  startedAt: string | null;
  finishedAt: string | null;
  currentSaveId: string | null;
  message?: string;
}

export type OpWire =
  | "harvest_metadata"
  | "capture_tweet"
  | "fetch_blobs"
  | "fetch_video_ytdlp"
  | "ensure_poster"
  | "fetch_avatar"
  | "finalize";

export interface PipelineMetricsWire {
  started: boolean;
  paused: boolean;
  inflightGlobal: number;
  inflightByOp: Record<OpWire, number>;
  runningTaskIds: string[];
  pausedSources: Array<{
    source: string;
    until: number;
    reason: "cooldown" | "breaker";
  }>;
  counters: {
    tasksDispatched: number;
    tasksCompleted: number;
    tasksFailed: number;
    tasksBlocked: number;
    watchdogTrips: number;
    cascadeEvents: number;
  };
}

const api = {
  tx(tx: unknown): Promise<unknown> {
    return ipcRenderer.invoke(IPC.tx, tx);
  },

  batch(txs: unknown[]): Promise<unknown[]> {
    return ipcRenderer.invoke(IPC.txBatch, txs);
  },

  undo(): Promise<unknown> {
    return ipcRenderer.invoke(IPC.undo);
  },

  redo(): Promise<unknown> {
    return ipcRenderer.invoke(IPC.redo);
  },

  query(name: string, params?: unknown): Promise<unknown> {
    return ipcRenderer.invoke(IPC.query, name, params);
  },

  onSyncAction(cb: (action: unknown) => void): () => void {
    const listener = (_: unknown, action: unknown) => cb(action);
    ipcRenderer.on(IPC.syncAction, listener);
    return () => ipcRenderer.off(IPC.syncAction, listener);
  },

  onNavigate(cb: (path: string) => void): () => void {
    const listener = (_: unknown, path: string) => cb(path);
    ipcRenderer.on(IPC.nav, listener);
    return () => ipcRenderer.off(IPC.nav, listener);
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

  onTabNew(cb: () => void): () => void {
    const listener = () => cb();
    ipcRenderer.on(IPC.tabNew, listener);
    return () => ipcRenderer.off(IPC.tabNew, listener);
  },

  onTabClose(cb: () => void): () => void {
    const listener = () => cb();
    ipcRenderer.on(IPC.tabClose, listener);
    return () => ipcRenderer.off(IPC.tabClose, listener);
  },

  onTabReopen(cb: () => void): () => void {
    const listener = () => cb();
    ipcRenderer.on(IPC.tabReopen, listener);
    return () => ipcRenderer.off(IPC.tabReopen, listener);
  },

  appInfo(): Promise<{
    name: string;
    version: string;
    platform: string;
    arch: string;
    username: string;
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
  }): Promise<
    | { ok: true; total: number }
    | { ok: false; reason: "already_running" | "no_saves" }
  > {
    return ipcRenderer.invoke(IPC.refreshBackfillStart, opts ?? {});
  },

  refreshBackfillCancel(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.refreshBackfillCancel);
  },

  refreshBackfillStatus(): Promise<RefreshBackfillStatusWire> {
    return ipcRenderer.invoke(IPC.refreshBackfillStatus);
  },

  onRefreshBackfillStatus(
    cb: (status: RefreshBackfillStatusWire) => void,
  ): () => void {
    const listener = (_: unknown, status: RefreshBackfillStatusWire) =>
      cb(status);
    ipcRenderer.on(IPC.refreshBackfillStatus, listener);
    return () => ipcRenderer.off(IPC.refreshBackfillStatus, listener);
  },

  connectSource(
    source: string,
  ): Promise<{ ok: boolean; mode: "external" | "skipped" }> {
    return ipcRenderer.invoke(IPC.sourceConnect, source);
  },

  disconnectSource(source: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.sourceDisconnect, source);
  },

  sourceStatus(source: string): Promise<{ ok: boolean; connected: boolean }> {
    return ipcRenderer.invoke(IPC.sourceStatus, source);
  },

  onSourceStatus(
    cb: (update: { source: string; connected: boolean }) => void,
  ): () => void {
    const listener = (
      _: unknown,
      update: { source: string; connected: boolean },
    ) => cb(update);
    ipcRenderer.on(IPC.sourceStatus, listener);
    return () => ipcRenderer.off(IPC.sourceStatus, listener);
  },

  videoToolsStatus(): Promise<{
    ok: boolean;
    ytdlp: { available: boolean; path: string | null };
    ffmpeg: { available: boolean; path: string | null };
  }> {
    return ipcRenderer.invoke(IPC.videoToolsStatus);
  },

  videoToolsReinstall(): Promise<{ ok: boolean; message: string }> {
    return ipcRenderer.invoke(IPC.videoToolsReinstall);
  },

  redownloadVideo(id: string): Promise<
    | { ok: true }
    | {
        ok: false;
        reason: "not_found" | "no_url" | "unsupported" | "internal_error";
      }
  > {
    return ipcRenderer.invoke(IPC.videoRedownload, id);
  },

  syncRunNow(
    source: string,
  ): Promise<{ ok: true } | { ok: false; reason: "already_running" }> {
    return ipcRenderer.invoke(IPC.syncRunNow, source);
  },

  syncCancel(source: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.syncCancel, source);
  },

  syncStatus(source: string): Promise<{
    ok: boolean;
    running: boolean;
    enabled: boolean;
    frequency: string;
    lastSyncedAt: string | null;
    lastError: string | null;
  }> {
    return ipcRenderer.invoke(IPC.syncStatus, source);
  },

  syncRunAll(): Promise<{ ok: true }> {
    return ipcRenderer.invoke(IPC.syncRunAll);
  },

  syncSchedulePeek(): Promise<{
    ok: boolean;
    lastFireAt: string | null;
    nextDueAt: string | null;
  }> {
    return ipcRenderer.invoke(IPC.syncSchedulePeek);
  },

  onSyncSchedule(
    cb: (update: {
      lastFireAt: string | null;
      nextDueAt: string | null;
    }) => void,
  ): () => void {
    const listener = (_: unknown, update: Parameters<typeof cb>[0]) =>
      cb(update);
    ipcRenderer.on(IPC.syncSchedulePush, listener);
    return () => ipcRenderer.off(IPC.syncSchedulePush, listener);
  },

  onSyncStatus(
    cb: (update: {
      source: string;
      state: "idle" | "running" | "done" | "error" | "auth_required";
      message?: string;
      progress?: { current: number; total: number };
      lastSyncedAt?: string | null;
      lastError?: string | null;
    }) => void,
  ): () => void {
    const listener = (_: unknown, update: Parameters<typeof cb>[0]) =>
      cb(update);
    ipcRenderer.on(IPC.syncStatus, listener);
    return () => ipcRenderer.off(IPC.syncStatus, listener);
  },

  onStorageStatus(cb: (status: StorageGuardStatusWire) => void): () => void {
    const listener = (_: unknown, status: StorageGuardStatusWire) => cb(status);
    ipcRenderer.on(IPC.storageStatus, listener);
    return () => ipcRenderer.off(IPC.storageStatus, listener);
  },

  onProcessingProgress(
    cb: (status: ProcessingProgressWire) => void,
  ): () => void {
    const listener = (_: unknown, status: ProcessingProgressWire) => cb(status);
    ipcRenderer.on(IPC.processingProgress, listener);
    return () => ipcRenderer.off(IPC.processingProgress, listener);
  },

  suggestions: {
    onShow(cb: (payload: SuggestionPayload) => void): () => void {
      const listener = (_: unknown, payload: SuggestionPayload) => cb(payload);
      ipcRenderer.on(IPC.suggestionShow, listener);
      return () => ipcRenderer.off(IPC.suggestionShow, listener);
    },
    ready(): void {
      ipcRenderer.send(IPC.suggestionReady);
    },
    dismiss(): void {
      ipcRenderer.send(IPC.suggestionDismiss);
    },
    act(actionId: string): void {
      ipcRenderer.send(IPC.suggestionAct, actionId);
    },
    notify(payload: SuggestionPayload): Promise<SuggestionResult> {
      return ipcRenderer.invoke(IPC.suggestionNotify, payload);
    },
  },

  notifications: {
    show(opts: {
      title: string;
      body?: string;
      silent?: boolean;
    }): Promise<{ ok: boolean; reason?: "unsupported" | "invalid" }> {
      return ipcRenderer.invoke(IPC.notificationShow, opts);
    },
  },
};

try {
  contextBridge.exposeInMainWorld("pond", api);
} catch (err) {
  console.error("[pond preload] contextBridge failed", err);
}

export type PondApi = typeof api;
