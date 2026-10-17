import { nativeTheme, Tray } from "electron";
import log from "electron-log/main.js";
import type { MenuActionId } from "../shared/constants";
import { pipelineSnapshot } from "./core/pipeline/reconciler";
import { loadTrayIcon } from "./tray-icon";
import { buildMenu, buildTooltip } from "./tray-menu";
import { trayBadge } from "./tray-status";

const BUSY_POLL_MS = 1_000;

export interface TrayHandle {
  tray: Tray;
  refresh: () => Promise<void>;
  destroy: () => void;
}

export interface TrayOptions {
  onOpenLibrary: () => void | Promise<void>;
  onOpenSettings?: () => void | Promise<void>;
  onOpenDownloads?: () => void | Promise<void>;
  onMenuAction: (id: MenuActionId) => void | Promise<void>;
}

let handle: TrayHandle | null = null;
let lastOpts: TrayOptions | null = null;
let busyPoll: NodeJS.Timeout | null = null;

export async function setTrayVisible(visible: boolean): Promise<void> {
  if (visible) {
    if (handle) return;
    if (!lastOpts) return;
    await ensureTray(lastOpts);
    return;
  }
  if (handle) {
    handle.destroy();
    handle = null;
  }
}

export async function ensureTray(opts: TrayOptions): Promise<TrayHandle> {
  lastOpts = opts;
  if (handle) return handle;

  let tray: Tray;
  try {
    tray = new Tray(loadTrayIcon());
  } catch (err) {
    log.error("[pond tray] failed to create tray", err);
    throw err;
  }
  tray.setToolTip("Pond");
  log.info("[pond tray] created");

  // Windows shows only the context menu on right-click; a plain click should open Pond.
  const onThemeUpdated = () => tray.setImage(loadTrayIcon());
  if (process.platform === "win32") {
    tray.on("click", () => void opts.onOpenLibrary());
    nativeTheme.on("updated", onThemeUpdated);
  }

  const instance: TrayHandle = {
    tray,
    async refresh() {
      try {
        const inflight = pipelineSnapshot().inflight;
        const { menu, ingesting } = await buildMenu(opts, inflight);
        tray.setContextMenu(menu);
        tray.setToolTip(await buildTooltip());
        setTrayCount(inflight);
        scheduleBusyPoll(ingesting > 0 || inflight > 0);
      } catch (err) {
        log.warn("[pond tray] refresh failed", err);
      }
    },
    destroy() {
      clearBusyPoll();
      nativeTheme.off("updated", onThemeUpdated);
      if (process.platform === "darwin") tray.setTitle("");
      tray.destroy();
      handle = null;
    },
  };

  handle = instance;
  await instance.refresh();
  return instance;
}

function setTrayCount(inflight: number): void {
  const tray = handle?.tray;
  if (!tray || process.platform !== "darwin") return;
  tray.setTitle(trayBadge({ inflight }), {
    fontType: "monospacedDigit",
  });
}

function scheduleBusyPoll(busy: boolean): void {
  clearBusyPoll();
  if (!busy) return;
  busyPoll = setTimeout(() => {
    busyPoll = null;
    void handle?.refresh();
  }, BUSY_POLL_MS);
}

function clearBusyPoll(): void {
  if (!busyPoll) return;
  clearTimeout(busyPoll);
  busyPoll = null;
}
