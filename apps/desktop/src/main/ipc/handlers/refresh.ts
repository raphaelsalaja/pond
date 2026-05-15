import type { Source } from "@pond/schema/db";
import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import {
  disconnectSource,
  isSourceConnected,
  refreshSave,
  signInToSource,
} from "../../core/refresh";
import {
  cancelRefreshBackfill,
  getRefreshBackfillStatus,
  startRefreshBackfill,
} from "../../core/refresh/backfill";
import { safeHandle } from "../helpers";

export function registerRefreshHandlers(): void {
  safeHandle(IPC.refreshSave, async (_, id: string) => {
    try {
      return await refreshSave(String(id));
    } catch (err) {
      log.error("[pond ipc] refreshSave failed", err);
      return { ok: false as const, reason: "internal_error" as const };
    }
  });

  safeHandle(
    IPC.refreshBackfillStart,
    async (_, opts: { source?: string | null; onlyMissing?: boolean } = {}) => {
      try {
        return await startRefreshBackfill({
          source: (opts?.source ?? null) as Source | null,
          onlyMissing: Boolean(opts?.onlyMissing),
        });
      } catch (err) {
        log.error("[pond ipc] refreshBackfillStart failed", err);
        return { ok: false as const, reason: "already_running" as const };
      }
    },
  );

  safeHandle(IPC.refreshBackfillCancel, async () => {
    cancelRefreshBackfill();
    return { ok: true as const };
  });

  safeHandle(IPC.refreshBackfillStatus, async () => {
    return getRefreshBackfillStatus();
  });

  safeHandle(IPC.sourceConnect, async (_, source: string) => {
    try {
      return await signInToSource(
        source as Parameters<typeof signInToSource>[0],
      );
    } catch (err) {
      log.warn("[pond ipc] sourceConnect failed", err);
      return { ok: false as const };
    }
  });

  safeHandle(IPC.sourceDisconnect, async (_, source: string) => {
    try {
      return await disconnectSource(
        source as Parameters<typeof disconnectSource>[0],
      );
    } catch (err) {
      log.warn("[pond ipc] sourceDisconnect failed", err);
      return { ok: false as const };
    }
  });

  safeHandle(IPC.sourceStatus, async (_, source: string) => {
    try {
      const connected = await isSourceConnected(
        source as Parameters<typeof isSourceConnected>[0],
      );
      return { ok: true as const, connected };
    } catch (err) {
      log.warn("[pond ipc] sourceStatus failed", err);
      return { ok: false as const, connected: false };
    }
  });
}
