import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import { resetTasksForSave } from "../../core/pipeline/enqueue";
import {
  binariesAvailable,
  invalidateBinariesCache,
} from "../../core/refresh/binaries";
import { safeHandle } from "../helpers";

export function registerVideoHandlers(): void {
  safeHandle(IPC.videoRedownload, async (_, id: string) => {
    try {
      await resetTasksForSave(String(id), "user:videoRedownload");
      return { ok: true as const };
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

  safeHandle(IPC.videoToolsReinstall, async () => {
    try {
      const { reinstallYtDlp } = await import("../../core/refresh/install");
      const result = await reinstallYtDlp();
      invalidateBinariesCache();
      return { ok: result.ok as boolean, message: result.message };
    } catch (err) {
      log.warn("[pond ipc] videoToolsReinstall failed", err);
      return { ok: false as const, message: String(err) };
    }
  });
}
