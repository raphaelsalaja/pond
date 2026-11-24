import { DEFAULT_SOURCE_SYNC_PREFS } from "@pond/schema/db";
import type {
  Source,
  SourceSyncPrefs,
  WatchedAccount,
  WatchKind,
} from "@pond/schema/db";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getPrefs, setPrefs } from "../prefs";
import { normalizeHandle } from "./accounts";

export async function listWatches(): Promise<Array<WatchedAccount>> {
  const prefs = await getPrefs();
  return Object.values(prefs.sync.watches ?? {}).sort((a, b) =>
    a.addedAt.localeCompare(b.addedAt),
  );
}

export async function getWatch(
  watchId: string,
): Promise<WatchedAccount | null> {
  const prefs = await getPrefs();
  return prefs.sync.watches?.[watchId] ?? null;
}

export async function findWatchByHandle(
  source: Source,
  handle: string,
  kind?: WatchKind,
): Promise<WatchedAccount | null> {
  const wanted = normalizeHandle(handle);
  if (!wanted) {
    return null;
  }
  const watches = await listWatches();
  return (
    watches.find(
      (w) =>
        w.source === source &&
        normalizeHandle(w.handle) === wanted &&
        (kind === undefined || (w.kind ?? kind) === kind),
    ) ?? null
  );
}

export async function createWatch(args: {
  source: Source;
  handle: string;
  kind?: WatchKind;
  label?: string | null;
  via?: string | null;
}): Promise<WatchedAccount> {
  const handle = normalizeHandle(args.handle);
  if (!handle) {
    throw new Error("watch handle is required");
  }
  const watch: WatchedAccount = {
    id: ulid(),
    source: args.source,
    handle,
    label: args.label ?? null,
    via: args.via ?? null,
    addedAt: new Date().toISOString(),
    sync: { ...DEFAULT_SOURCE_SYNC_PREFS },
  };
  if (args.kind) {
    watch.kind = args.kind;
  }

  await writeWatches((watches) => ({ ...watches, [watch.id]: watch }));
  log.info(
    `[pond watches] created ${watch.source} watch`,
    watch.id,
    watch.kind === "feed" ? "feed" : handle,
  );
  return watch;
}

export async function patchWatch(
  watchId: string,
  patch: Partial<
    Pick<
      WatchedAccount,
      "handle" | "label" | "via" | "avatarUrl" | "avatarCheckedAt"
    >
  >,
): Promise<WatchedAccount | null> {
  let updated: WatchedAccount | null = null;
  await writeWatches((watches) => {
    const current = watches[watchId];
    if (!current) {
      return watches;
    }
    updated = {
      ...current,
      ...patch,
      handle:
        patch.handle !== undefined
          ? (normalizeHandle(patch.handle) ?? current.handle)
          : current.handle,
    };
    return { ...watches, [watchId]: updated };
  });
  return updated;
}

export async function getWatchSync(watchId: string): Promise<SourceSyncPrefs> {
  const watch = await getWatch(watchId);
  return { ...DEFAULT_SOURCE_SYNC_PREFS, ...watch?.sync };
}

export async function patchWatchSync(
  watchId: string,
  patch: Partial<SourceSyncPrefs>,
): Promise<SourceSyncPrefs> {
  let next: SourceSyncPrefs = { ...DEFAULT_SOURCE_SYNC_PREFS, ...patch };
  await writeWatches((watches) => {
    const current = watches[watchId];
    if (!current) {
      return watches;
    }
    next = { ...DEFAULT_SOURCE_SYNC_PREFS, ...current.sync, ...patch };
    return { ...watches, [watchId]: { ...current, sync: next } };
  });
  return next;
}

export async function removeWatch(watchId: string): Promise<void> {
  await writeWatches((watches) => {
    if (!watches[watchId]) {
      return watches;
    }
    const next = { ...watches };
    delete next[watchId];
    return next;
  });
}

async function writeWatches(
  update: (
    watches: Record<string, WatchedAccount>,
  ) => Record<string, WatchedAccount>,
): Promise<void> {
  const prefs = await getPrefs();
  const current = prefs.sync.watches ?? {};
  const next = update(current);
  if (next === current) {
    return;
  }
  await setPrefs({ sync: { watches: next } });
}
