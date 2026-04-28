import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/constants";

/**
 * `window.pond` is the ONLY surface the renderer sees. Everything flows
 * through the transaction executor in main. See plan §
 * "Transactions, Object Pool & sync actions".
 */

const api = {
  /** Hit the executor with a single typed transaction. */
  tx(tx: unknown): Promise<unknown> {
    return ipcRenderer.invoke(IPC.tx, tx);
  },

  /** Coalesce N transactions into one DB transaction. */
  batch(txs: unknown[]): Promise<unknown[]> {
    return ipcRenderer.invoke(IPC.txBatch, txs);
  },

  /** Undo the most recent transaction (Cmd-Z). */
  undo(): Promise<unknown> {
    return ipcRenderer.invoke(IPC.undo);
  },

  /** Redo (Cmd-Shift-Z). */
  redo(): Promise<unknown> {
    return ipcRenderer.invoke(IPC.redo);
  },

  /** Read-only queries (list saves, search, ...). */
  query(name: string, params?: unknown): Promise<unknown> {
    return ipcRenderer.invoke(IPC.query, name, params);
  },

  /** Subscribe to sync-action broadcasts from the executor. */
  onSyncAction(cb: (action: unknown) => void): () => void {
    const listener = (_: unknown, action: unknown) => cb(action);
    ipcRenderer.on(IPC.syncAction, listener);
    return () => ipcRenderer.off(IPC.syncAction, listener);
  },

  /** Main -> renderer navigation request. Fired by tray menu. */
  onNavigate(cb: (path: string) => void): () => void {
    const listener = (_: unknown, path: string) => cb(path);
    ipcRenderer.on(IPC.nav, listener);
    return () => ipcRenderer.off(IPC.nav, listener);
  },

  /** Basic app metadata. */
  appInfo(): Promise<{
    name: string;
    version: string;
    platform: string;
    arch: string;
  }> {
    return ipcRenderer.invoke(IPC.appInfo);
  },

  /**
   * Open a URL in the user's default browser. Used by the "Re-capture"
   * button so the extension can re-scrape a save that was ingested
   * before the current scraper features existed.
   */
  openExternal(url: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.openExternal, url);
  },

  /**
   * Reveal a save's primary (or indexed) file in the OS file manager —
   * Finder on macOS, Explorer on Windows, whichever `xdg-open` targets
   * on Linux. The main process owns path resolution so the renderer
   * never sees an absolute filesystem path.
   */
  revealSave(
    id: string,
    fileIndex?: number,
  ): Promise<{ ok: boolean; reason?: string }> {
    return ipcRenderer.invoke(IPC.revealSave, id, fileIndex);
  },

  /** Open a save's file with the OS default handler (e.g. Preview, VLC). */
  openSaveFile(
    id: string,
    fileIndex?: number,
  ): Promise<{ ok: boolean; reason?: string }> {
    return ipcRenderer.invoke(IPC.openSaveFile, id, fileIndex);
  },

  /**
   * Ask main to pop the native right-click context menu for a save.
   * Coordinates come from the cursor automatically; we just need the id
   * so main can populate the menu (move-to-trash, copy URL, etc.).
   */
  showSaveContextMenu(id: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.saveContextMenu, id);
  },

  /**
   * Refresh a save's metadata without leaving the app. Tries a cheap
   * server-side OG fetch first, then falls back to a hidden Chromium
   * window with the user's logged-in cookies for auth-walled sources.
   *
   * Resolved values mirror `RefreshOutcome` in main; the renderer
   * branches on `ok` to decide between success toast / error toast /
   * "Connect <source>" prompt.
   */
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

  /**
   * Open a visible Chromium window pointed at <source>'s login page so
   * the user can sign in once. Cookies persist across runs in a
   * dedicated `persist:pond-scrapers` partition, so subsequent
   * `refreshSave` calls run authenticated.
   */
  connectSource(source: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.sourceConnect, source);
  },

  /** Wipe the persisted cookies/storage for a given source. */
  disconnectSource(source: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.sourceDisconnect, source);
  },

  /** Cheap probe: do we currently hold cookies for `<source>`? */
  sourceStatus(source: string): Promise<{ ok: boolean; connected: boolean }> {
    return ipcRenderer.invoke(IPC.sourceStatus, source);
  },

  /**
   * Probe the bundled video tools (yt-dlp + ffmpeg). Drives the
   * settings page indicator so the user can tell at a glance whether
   * Refresh on a video card will actually produce playable bytes.
   */
  videoToolsStatus(): Promise<{
    ok: boolean;
    ytdlp: { available: boolean; path: string | null };
    ffmpeg: { available: boolean; path: string | null };
  }> {
    return ipcRenderer.invoke(IPC.videoToolsStatus);
  },

  /**
   * Re-run the postinstall script that ships yt-dlp into the
   * resources/bin folder. Used by the "Reinstall" button on settings
   * to recover from a network failure during the original install.
   */
  videoToolsReinstall(): Promise<{ ok: boolean; message: string }> {
    return ipcRenderer.invoke(IPC.videoToolsReinstall);
  },

  /**
   * Renderer-driven auto-heal for unplayable videos. Called from
   * `<video onError>` handlers when Electron's bundled ffmpeg fails
   * to decode a saved file (the canonical case is yt-dlp landing an
   * AV1 / HEVC stream before our selector tightening). Main re-runs
   * yt-dlp with the corrected H.264-only selector and overwrites the
   * stale bytes; the pool sync action that follows triggers a card
   * re-render with a fresh sha-bumped URL so the new bytes paint.
   *
   * Idempotent on the main side — calling twice for the same id while
   * a download is queued or in flight collapses or sequences cleanly.
   * The renderer should still dedupe per session to avoid spamming the
   * IPC channel during the brief window where the broken `<video>` is
   * still mounted.
   */
  redownloadVideo(id: string): Promise<
    | { ok: true }
    | {
        ok: false;
        reason: "not_found" | "no_url" | "unsupported" | "internal_error";
      }
  > {
    return ipcRenderer.invoke(IPC.videoRedownload, id);
  },

  /**
   * Subscribe to auto-video queue snapshots. Main pushes one snapshot
   * per queue mutation (enqueue / pickup / completion); the listener
   * also gets an initial snapshot when the renderer finishes loading,
   * so callers don't need to do a separate fetch on first render.
   *
   * Returns a disposer.
   */
  onVideoDownloadStatus(
    cb: (status: { pending: string[]; inFlight: string[] }) => void,
  ): () => void {
    const listener = (
      _: unknown,
      status: { pending: string[]; inFlight: string[] },
    ) => cb(status);
    ipcRenderer.on(IPC.autoVideoStatus, listener);
    return () => ipcRenderer.off(IPC.autoVideoStatus, listener);
  },
};

try {
  contextBridge.exposeInMainWorld("pond", api);
} catch (err) {
  console.error("[pond preload] contextBridge failed", err);
}

export type PondApi = typeof api;
