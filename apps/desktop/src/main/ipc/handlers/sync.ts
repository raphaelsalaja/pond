import { isSource } from "@pond/schema/sources";
import { IPC } from "../../../shared/constants";
import {
  isAllPaused,
  pauseAll,
  resumeAll,
  resumeSource,
} from "../../core/pipeline/rate-governor";
import {
  cancelSync,
  getAccountSync,
  isSyncAllSourcesRunning,
  isSyncing,
  syncAccount,
  syncAllSources,
} from "../../core/sync";
import { getWatch, getWatchSync } from "../../core/sync/watches";
import { watchNow } from "../../core/watch/run";
import { safeHandle } from "../helpers";

export function registerSyncHandlers(): void {
  safeHandle(
    IPC.syncRunNow,
    async (_, accountId: string, opts?: { forceFull?: boolean }) => {
      const id = String(accountId);
      if (isSyncing(id)) {
        return { ok: false as const, reason: "already_running" as const };
      }
      if (await getWatch(id)) {
        void watchNow(id, { trigger: "manual" });
        return { ok: true as const };
      }
      void syncAccount(id, {
        trigger: "manual",
        forceFull: opts?.forceFull ?? false,
      });
      return { ok: true as const };
    },
  );

  safeHandle(IPC.syncStatus, async (_, accountId: string) => {
    const id = String(accountId);
    const cfg = (await getWatch(id))
      ? await getWatchSync(id)
      : await getAccountSync(id);
    return {
      ok: true as const,
      running: isSyncing(id),
      lastSyncedAt: cfg.lastSyncedAt,
      lastError: cfg.lastError,
    };
  });

  safeHandle(IPC.syncRunAll, async (_, opts?: { forceFull?: boolean }) => {
    if (isSyncAllSourcesRunning()) {
      return { ok: false as const, reason: "already_running" as const };
    }
    await syncAllSources({
      trigger: "manual",
      forceFull: opts?.forceFull ?? false,
    });
    return { ok: true as const };
  });

  safeHandle(IPC.syncCancel, async (_, accountId: string) => {
    const id = String(accountId);
    const running = isSyncing(id);
    cancelSync(id);
    return { ok: true as const, running };
  });

  safeHandle(IPC.governorSetPaused, async (_, paused: boolean) => {
    if (paused) pauseAll();
    else resumeAll();
    return { ok: true as const, allPaused: isAllPaused() };
  });

  safeHandle(IPC.governorResumeSource, async (_, source: string) => {
    if (isSource(source)) resumeSource(source);
    return { ok: true as const };
  });
}
