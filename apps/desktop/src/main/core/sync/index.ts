import type { ConnectedAccount, Source } from "@pond/schema/db";
import type { SyncRunEvent } from "@pond/schema/events";
import log from "electron-log/main.js";
import { commitEvent, startSyncEvent, toErrorInfo } from "../../lib/wide-event";
import { isAccountConnected } from "../refresh/harvest-window";
import { isSyncBlockedByStorageGuard } from "../storage-watcher";
import { watchNow } from "../watch/run";
import { ensureAccountHandle } from "./account-key";
import {
  getAccount,
  getAccountSync,
  listAccounts,
  listAccountsForSource,
  patchAccountSync,
} from "./accounts";
import { isImportPending } from "./import-scope";
import { LIST_HARVEST_SOURCES, syncListSource } from "./run-list";
import { syncThreads } from "./run-threads";
import { syncTwitter } from "./run-twitter";
import { emit, inFlight } from "./sync-status";
import { listWatches } from "./watches";

export { getAccountSync } from "./accounts";
export {
  cancelSync,
  isSyncing,
  type SyncStatusUpdate,
  subscribeToSyncStatus,
} from "./sync-status";

const IMPORT_PENDING_MESSAGE = "Choose what to import to start syncing.";

interface SyncOptions {
  trigger?: "manual" | "cron";
  maxItems?: number;
  forceFull?: boolean;
}

const SYNC_WATCHDOG_MS = {
  twitter: 30 * 60_000,
  youtube: 20 * 60_000,
  cosmos: 20 * 60_000,
  arena: 20 * 60_000,
  pinterest: 20 * 60_000,
  instagram: 20 * 60_000,
  tiktok: 20 * 60_000,
  reddit: 20 * 60_000,
  threads: 20 * 60_000,
  web: 20 * 60_000,
  local: 20 * 60_000,
} satisfies Record<Source, number>;

const SYNCABLE_SOURCES: readonly Source[] = [
  "twitter",
  "youtube",
  "cosmos",
  "arena",
  "pinterest",
  "instagram",
  "tiktok",
  "reddit",
  "threads",
];

function isSyncableSource(source: Source): boolean {
  return SYNCABLE_SOURCES.includes(source);
}

export async function syncAllSources(opts: SyncOptions = {}): Promise<void> {
  const accounts = (await listAccounts()).filter((a) =>
    isSyncableSource(a.source),
  );
  const connected = await Promise.all(
    accounts.map(async (account) =>
      (await isAccountConnected(account).catch(() => false)) ? account : null,
    ),
  );
  const runnable = connected.filter((a): a is ConnectedAccount => a !== null);
  const watches = await listWatches();
  const sources = new Set<Source>([
    ...runnable.map((account) => account.source),
    ...watches.map((watch) => watch.source),
  ]);
  if (sources.size === 0) return;

  await Promise.all(
    Array.from(sources).map(async (source) => {
      const group = runnable.filter((account) => account.source === source);
      for (const account of group) {
        await syncAccount(account.id, opts).catch((err) =>
          log.warn("[pond sync] syncAccount threw", account.id, err),
        );
      }
      await syncWatchesForSource(source, opts);
    }),
  );
}

export async function syncSource(
  source: Source,
  opts: SyncOptions = {},
): Promise<void> {
  const accounts = await listAccountsForSource(source);
  for (const account of accounts) {
    await syncAccount(account.id, opts).catch((err) =>
      log.warn("[pond sync] syncAccount threw", account.id, err),
    );
  }
  await syncWatchesForSource(source, opts);
}

async function syncWatchesForSource(
  source: Source,
  opts: SyncOptions,
): Promise<void> {
  const watches = (await listWatches()).filter(
    (watch) => watch.source === source,
  );
  for (const watch of watches) {
    await watchNow(watch.id, { trigger: opts.trigger ?? "manual" }).catch(
      (err) => log.warn("[pond watch] watchNow threw", watch.id, err),
    );
  }
}

export async function syncAccount(
  accountId: string,
  opts: SyncOptions = {},
): Promise<void> {
  const account = await getAccount(accountId);
  if (!account) {
    log.warn("[pond sync] unknown account, skipping", accountId);
    return;
  }
  const { source } = account;
  const existing = inFlight.get(accountId);
  if (existing) {
    const ageSec = Math.round((Date.now() - existing.startedAt) / 1000);
    log.info(
      `[pond sync] already running (${ageSec}s), ignoring ${source}/${accountId} (${opts.trigger ?? "manual"})`,
    );
    return;
  }
  if (isImportPending(account.sync)) {
    log.info(
      `[pond sync] waiting for import choice, skipping ${source}/${accountId} (${opts.trigger ?? "manual"})`,
    );
    emit({
      accountId,
      source,
      state: "idle",
      message: IMPORT_PENDING_MESSAGE,
    });
    return;
  }
  if (isSyncBlockedByStorageGuard()) {
    log.info(
      "[pond sync] blocked by storage guard, skipping",
      source,
      opts.trigger ?? "manual",
    );
    emit({
      accountId,
      source,
      state: "error",
      message: "Paused. Pond storage cap reached. Free space or raise the cap.",
      lastError: "storage_cap_exceeded",
    });
    return;
  }
  const controller = new AbortController();
  let watchdogTripped = false;
  const watchdog = setTimeout(() => {
    watchdogTripped = true;
    log.warn(
      `[pond sync] watchdog tripped for ${source}/${accountId} after ${Math.round(SYNC_WATCHDOG_MS[source] / 60_000)}m; aborting`,
    );
    controller.abort();
  }, SYNC_WATCHDOG_MS[source]);
  const startedAt = Date.now();
  inFlight.set(accountId, {
    controller,
    startedAt,
    watchdog,
    source,
  });
  const ev: SyncRunEvent = startSyncEvent({
    source,
    accountId,
    trigger: opts.trigger ?? "manual",
    outcome: "ok",
  });
  emit({ accountId, source, state: "running", message: "Starting" });
  try {
    await patchAccountSync(accountId, {
      runningSince: new Date(startedAt).toISOString(),
    });
    await ensureAccountHandle(account);
    if (source === "twitter") {
      await syncTwitter(
        account,
        controller.signal,
        ev,
        opts.maxItems,
        opts.forceFull,
      );
    } else if (source === "threads") {
      await syncThreads(
        account,
        controller.signal,
        ev,
        opts.maxItems,
        opts.forceFull,
      );
    } else if (LIST_HARVEST_SOURCES.has(source)) {
      await syncListSource(
        account,
        controller.signal,
        ev,
        opts.maxItems,
        opts.forceFull,
      );
    } else {
      await patchAccountSync(accountId, { lastError: "unsupported" });
      emit({
        accountId,
        source,
        state: "error",
        message: "This source doesn't support background sync yet.",
        lastError: "unsupported",
      });
      ev.outcome = "error";
      ev.error = { name: "Unsupported", message: "source has no sync runner" };
      return;
    }
    if (controller.signal.aborted) {
      ev.outcome = "aborted";
      const cfg = await getAccountSync(accountId);
      emit({
        accountId,
        source,
        state: watchdogTripped ? "error" : "idle",
        message: watchdogTripped ? "Sync timed out." : "Sync stopped.",
        lastSyncedAt: cfg.lastSyncedAt,
        lastError: watchdogTripped ? "watchdog_timeout" : cfg.lastError,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("[pond sync] fatal error", source, accountId, err);
    await patchAccountSync(accountId, { lastError: msg }).catch((patchErr) =>
      log.warn("[pond sync] failed to record lastError", accountId, patchErr),
    );
    emit({
      accountId,
      source,
      state: "error",
      message: msg,
      lastError: msg,
    });
    ev.outcome = "error";
    ev.error = toErrorInfo(err);
  } finally {
    const entry = inFlight.get(accountId);
    if (entry) clearTimeout(entry.watchdog);
    inFlight.delete(accountId);
    await patchAccountSync(accountId, { runningSince: null }).catch((err) =>
      log.warn("[pond sync] failed to clear runningSince", accountId, err),
    );
    ev.durationMs = Date.now() - startedAt;
    ev.lockHeldMs = ev.durationMs;
    ev.watchdogTripped = watchdogTripped;
    if (watchdogTripped) ev.outcome = "aborted";
    void commitEvent(ev);
  }
}

export async function recoverInterruptedSyncs(): Promise<string[]> {
  const recovered: string[] = [];
  for (const account of await listAccounts()) {
    const cfg = await getAccountSync(account.id);
    if (!cfg.runningSince) continue;
    try {
      await patchAccountSync(account.id, {
        runningSince: null,
        lastError: "interrupted",
      });
    } catch (err) {
      log.warn(
        "[pond sync] failed to recover interrupted run",
        account.id,
        err,
      );
      continue;
    }
    recovered.push(account.id);
    emit({
      accountId: account.id,
      source: account.source,
      state: "idle",
      message: "Previous sync was interrupted.",
      lastSyncedAt: cfg.lastSyncedAt,
      lastError: "interrupted",
    });
  }
  if (recovered.length > 0) {
    log.info("[pond sync] recovered interrupted runs", recovered);
  }
  return recovered;
}
