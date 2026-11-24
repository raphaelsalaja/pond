import { connectsByHandle, isSource } from "@pond/schema/sources";
import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import {
  isSourceConnected,
  refreshSave,
  signInToSource,
} from "../../core/refresh";
import {
  archiveSiteForSave,
  startArchiveBackfill,
} from "../../core/refresh/archive-backfill";
import {
  cancelRefreshBackfill,
  startRefreshBackfill,
} from "../../core/refresh/backfill";
import {
  clearPendingSessionSource,
  setPendingSessionSource,
} from "../../pending-session";
import { safeHandle } from "../helpers";

export function registerRefreshHandlers(): void {
  safeHandle(IPC.refreshSave, async (_, id: string) => {
    try {
      return await refreshSave(String(id));
    } catch (error) {
      log.error("[pond ipc] refreshSave failed", error);
      return { ok: false as const, reason: "internal_error" as const };
    }
  });

  safeHandle(
    IPC.refreshBackfillStart,
    async (
      _,
      opts: {
        source?: string | null;
        onlyMissing?: boolean;
        overwrite?: boolean;
      } = {},
    ) => {
      const source = opts?.source ?? "";
      try {
        return await startRefreshBackfill({
          source: isSource(source) ? source : null,
          onlyMissing: Boolean(opts?.onlyMissing),
          overwrite: Boolean(opts?.overwrite),
        });
      } catch (error) {
        log.error("[pond ipc] refreshBackfillStart failed", error);
        return { ok: false as const, reason: "already_running" as const };
      }
    },
  );

  safeHandle(IPC.refreshBackfillCancel, async () => {
    cancelRefreshBackfill();
    return { ok: true as const };
  });

  safeHandle(IPC.archiveBackfillStart, async () => {
    try {
      return await startArchiveBackfill();
    } catch (error) {
      log.error("[pond ipc] archiveBackfillStart failed", error);
      return { ok: true as const, queued: 0 };
    }
  });

  safeHandle(IPC.archiveSite, async (_, id: string) => {
    try {
      return await archiveSiteForSave(String(id));
    } catch (error) {
      log.error("[pond ipc] archiveSite failed", error);
      return { ok: false as const };
    }
  });

  safeHandle(IPC.sourceConnect, async (_, source: string) => {
    try {
      if (!isSource(source)) {
        return { ok: false as const, mode: "external" };
      }
      if (connectsByHandle(source)) {
        return { ok: true as const, mode: "external" as const };
      }
      setPendingSessionSource(source);
      return await signInToSource(source);
    } catch (error) {
      log.warn("[pond ipc] sourceConnect failed", error);
      return { ok: false as const, mode: "external" };
    }
  });

  safeHandle(
    IPC.sourceConnectHandle,
    async (_, source: string, handle: string) => {
      try {
        if (source !== "bluesky") {
          return { ok: false as const, reason: "invalid" as const };
        }
        const { connectByHandle, liveConnectDeps } =
          await import("../../core/refresh/harvest/bluesky/connect");
        return await connectByHandle(String(handle), liveConnectDeps());
      } catch (error) {
        log.warn("[pond ipc] sourceConnectHandle failed", error);
        return { ok: false as const, reason: "unavailable" as const };
      }
    },
  );

  safeHandle(IPC.sourceStatus, async (_, source: string) => {
    try {
      const connected = isSource(source)
        ? await isSourceConnected(source)
        : false;
      return { ok: true as const, connected };
    } catch (error) {
      log.warn("[pond ipc] sourceStatus failed", error);
      return { ok: false as const, connected: false };
    }
  });

  safeHandle(IPC.sessionPendingClear, async (_, source?: string) => {
    if (source !== undefined && isSource(source)) {
      clearPendingSessionSource(source);
    } else {
      clearPendingSessionSource();
    }
    return { ok: true as const };
  });
}
