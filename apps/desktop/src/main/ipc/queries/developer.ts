import { mkdir } from "node:fs/promises";
import { app, BrowserWindow, shell } from "electron";
import log from "electron-log/main.js";
import type { QueryHandlerMap } from "../helpers";

export const developerQueries: QueryHandlerMap = {
  async "developer.openLogs"() {
    const logsDir = app.getPath("logs");
    try {
      await mkdir(logsDir, { recursive: true });
    } catch (err) {
      log.warn("[pond ipc] logs mkdir failed", err);
    }
    const err = await shell.openPath(logsDir);
    if (err) return { ok: false as const, reason: err };
    return { ok: true as const };
  },

  async "developer.applyVerboseLogging"(params) {
    const verbose = Boolean(params.verbose);
    log.transports.file.level = verbose ? "debug" : "info";
    log.transports.console.level = verbose ? "debug" : "info";
    return { ok: true as const };
  },

  async "developer.openIpcInspector"() {
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
  },
};
