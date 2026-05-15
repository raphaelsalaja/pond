import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import { redownloadVideoForSave } from "../../core/auto-video";
import {
  binariesAvailable,
  invalidateBinariesCache,
} from "../../core/refresh/binaries";
import { safeHandle } from "../helpers";

export function registerVideoHandlers(): void {
  safeHandle(IPC.videoRedownload, async (_, id: string) => {
    // #region agent log
    fetch("http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "7b119d",
      },
      body: JSON.stringify({
        sessionId: "7b119d",
        hypothesisId: "H1",
        location: "ipc/handlers/video.ts:videoRedownload",
        message: "videoRedownload IPC handler entered",
        data: { id: String(id) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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

  safeHandle(
    IPC.videoRegeneratePosters,
    async (_event, opts: { force?: boolean } = {}) => {
      try {
        const { enqueueAllMissing } = await import(
          "../../core/poster-backfill"
        );
        const { scheduled } = await enqueueAllMissing({
          force: opts.force === true,
        });
        return { ok: true as const, scheduled };
      } catch (err) {
        log.warn("[pond ipc] videoRegeneratePosters failed", err);
        return { ok: false as const, scheduled: 0 };
      }
    },
  );
}
