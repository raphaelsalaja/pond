import type { ConnectedAccount } from "@pond/schema/db";
import type { SyncRunEvent } from "@pond/schema/events";
import { libraryRoot } from "../../paths";
import { setSourceCooldown } from "../pipeline/rate-governor";
import { patchAccountSync } from "../sync/accounts";
import { organizeIncoming } from "../sync/incoming";
import { emit } from "../sync/sync-status";
import { type createMymindClient, MymindApiError } from "./client";
import { readMymindCredential, removeMymindCredential } from "./credentials";
import { importMymindObject } from "./import";
import {
  type MymindSyncState,
  readMymindSyncState,
  writeMymindSyncState,
} from "./state";
import { createConnectedMymindClient } from "./transport";

const DATE_OVERLAP_MS = 5 * 60_000;

interface ImportDependencies {
  client: Pick<ReturnType<typeof createMymindClient>, "listCreatedObjects">;
  importObject: (
    object: Parameters<typeof importMymindObject>[0]["object"],
  ) => Promise<{ id: string; imported: boolean }>;
  persist: () => Promise<void>;
  now: number;
}

export async function importNewMymindObjects(
  state: MymindSyncState,
  signal: AbortSignal,
  maxItems: number | undefined,
  dependencies: ImportDependencies,
): Promise<{ imported: string[]; processed: number; hasMore: boolean }> {
  signal.throwIfAborted();
  const cutoff = Date.parse(state.startedAt);
  const start = Math.max(
    cutoff,
    Date.parse(state.checkedThrough) - DATE_OVERLAP_MS,
  );
  const end = dependencies.now;
  const imported: string[] = [];
  let processed = 0;
  let hasMore = false;
  if (start >= end) return { imported, processed, hasMore };

  for await (const object of dependencies.client.listCreatedObjects({
    start,
    end,
    signal,
  })) {
    signal.throwIfAborted();
    const created = Date.parse(object.created);
    // Enforce the start time locally even if the API returns older matches.
    if (
      created < cutoff ||
      created >= end ||
      state.imports[object.id]?.complete
    )
      continue;
    if (maxItems !== undefined && processed >= maxItems) {
      hasMore = true;
      break;
    }
    const result = await dependencies.importObject(object);
    signal.throwIfAborted();
    processed += 1;
    if (result.imported) imported.push(result.id);
  }

  signal.throwIfAborted();
  // A partial stream must keep its lower bound until every item is processed.
  if (!hasMore) state.checkedThrough = new Date(end).toISOString();
  delete state.retryAt;
  await dependencies.persist();
  return { imported, processed, hasMore };
}

export async function syncMymind(
  account: ConnectedAccount,
  signal: AbortSignal,
  event: SyncRunEvent,
  maxItems?: number,
): Promise<void> {
  const accountId = account.id;
  const root = libraryRoot();
  const state = await readMymindSyncState(root, accountId);
  const persist = () => writeMymindSyncState(root, accountId, state);
  const now = Date.now();
  if (state.retryAt && state.retryAt > now) {
    emit({
      accountId,
      source: "mymind",
      state: "paused",
      message: "mymind request limit reached. Pond will try again later.",
    });
    return;
  }
  const credential = await readMymindCredential(accountId);
  if (!credential) {
    await patchAccountSync(accountId, { lastError: "auth_required" });
    emit({
      accountId,
      source: "mymind",
      state: "auth_required",
      message: "Reconnect mymind with a read-only access key.",
      lastError: "auth_required",
    });
    return;
  }
  const client = createConnectedMymindClient(credential);
  emit({
    accountId,
    source: "mymind",
    state: "running",
    message: "Reading new saves",
  });
  try {
    const result = await importNewMymindObjects(state, signal, maxItems, {
      client,
      now,
      persist,
      importObject: async (object) => {
        signal.throwIfAborted();
        if (libraryRoot() !== root)
          throw new Error("The Library changed. The mymind import stopped.");
        const result = await importMymindObject({
          object,
          accountId,
          state,
          client,
          persist,
          signal,
          beforeWrite: () => {
            signal.throwIfAborted();
            if (libraryRoot() !== root)
              throw new Error(
                "The Library changed. The mymind import stopped.",
              );
          },
        });
        if (result.imported)
          await organizeIncoming(
            [result.id],
            account.sync.incoming,
            "sync:mymind",
          );
        emit({
          accountId,
          source: "mymind",
          state: "running",
          message: "Importing new saves",
        });
        return result;
      },
    });
    signal.throwIfAborted();
    const lastSyncedAt = new Date().toISOString();
    await patchAccountSync(accountId, { lastSyncedAt, lastError: null });
    event.enqueue = { succeeded: result.processed, failed: 0 };
    emit({
      accountId,
      source: "mymind",
      state: "done",
      message: result.hasMore
        ? "More new saves will import on the next run."
        : "All new saves are imported.",
      lastSyncedAt,
      lastError: null,
    });
  } catch (error) {
    if (error instanceof MymindApiError && error.status === 429) {
      state.retryAt = error.retryAt ?? Date.now() + 60_000;
      setSourceCooldown("mymind", state.retryAt - Date.now());
      await persist();
    }
    if (
      error instanceof MymindApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      await removeMymindCredential(accountId);
      await patchAccountSync(accountId, { lastError: "auth_required" });
      event.outcome = "error";
      emit({
        accountId,
        source: "mymind",
        state: "auth_required",
        message: "Reconnect mymind with a read-only access key.",
        lastError: "auth_required",
      });
      return;
    }
    throw error;
  }
}
