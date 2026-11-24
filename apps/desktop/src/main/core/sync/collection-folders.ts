import { saveFolders, saves } from "@pond/schema/db";
import type {
  ConnectedAccount,
  Folder,
  ImportCollection,
  SourceSyncPrefs,
} from "@pond/schema/db";
import { sourceLabel } from "@pond/schema/sources";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import log from "electron-log/main.js";
import {
  accountImportScope,
  collectionFiling,
} from "../../../shared/import-scope";
import { getDb } from "../../db";
import { assignSaveFolders, createFolder, listFolders } from "../folders";
import { patchAccountSync } from "./accounts";

export interface CollectionEntry {
  sourceId: string;
  collectionIds?: Array<string>;
}

export interface CollectionFolderStore {
  listFolders: () => Promise<Array<Folder>>;
  createFolder: (name: string, parentId: string | null) => Promise<Folder>;
  /** Save ids by source id, leaving out deleted saves and saves the import filters skipped. */
  saveIds: (
    source: ConnectedAccount["source"],
    sourceIds: Array<string>,
  ) => Promise<Map<string, string>>;
  folderIds: (saveIds: Array<string>) => Promise<Map<string, Array<string>>>;
  assign: (
    assignments: Array<{ saveId: string; folderIds: Array<string> }>,
  ) => Promise<void>;
  rememberFolders: (
    accountId: string,
    patch: Pick<SourceSyncPrefs, "collectionFolders">,
  ) => Promise<void>;
}

const CHUNK = 500;

function chunks<T>(values: Array<T>): Array<Array<T>> {
  const out: Array<Array<T>> = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    out.push(values.slice(i, i + CHUNK));
  }
  return out;
}

const defaultStore: CollectionFolderStore = {
  listFolders,
  createFolder: (name, parentId) => createFolder({ name, parentId }),
  async saveIds(source, sourceIds) {
    const db = await getDb();
    const found = new Map<string, string>();
    for (const batch of chunks(sourceIds)) {
      const rows = await db
        .select({ id: saves.id, sourceId: saves.sourceId })
        .from(saves)
        .where(
          and(
            eq(saves.source, source),
            inArray(saves.sourceId, batch),
            isNull(saves.deletedAt),
            ne(saves.status, "skipped"),
          ),
        );
      for (const row of rows) {
        found.set(row.sourceId, row.id);
      }
    }
    return found;
  },
  async folderIds(saveIds) {
    const db = await getDb();
    const found = new Map<string, Array<string>>();
    for (const batch of chunks(saveIds)) {
      const rows = await db
        .select({ saveId: saveFolders.saveId, folderId: saveFolders.folderId })
        .from(saveFolders)
        .where(inArray(saveFolders.saveId, batch));
      for (const row of rows) {
        found.set(row.saveId, [...(found.get(row.saveId) ?? []), row.folderId]);
      }
    }
    return found;
  },
  async assign(assignments) {
    for (const batch of chunks(assignments)) {
      await assignSaveFolders(batch, false);
    }
  },
  async rememberFolders(accountId, patch) {
    await patchAccountSync(accountId, patch);
  },
};

function sameName(folder: Folder, name: string): boolean {
  return folder.name.trim().toLowerCase() === name.trim().toLowerCase();
}

/** Finds or creates `Source / collection` Folders, preferring the Folder this collection was filed into before. */
async function resolveCollectionFolders(
  account: Pick<ConnectedAccount, "id" | "source" | "sync">,
  collections: ReadonlyArray<ImportCollection>,
  store: CollectionFolderStore = defaultStore,
): Promise<Map<string, string>> {
  const folders = await store.listFolders();
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const remembered = account.sync.collectionFolders ?? {};
  const resolved = new Map<string, string>();
  let root: Folder | null = null;
  const rootFolder = async (): Promise<Folder> => {
    if (root) {
      return root;
    }
    const label = sourceLabel(account.source);
    root =
      folders.find(
        (folder) => folder.parentId === null && sameName(folder, label),
      ) ?? (await store.createFolder(label, null));
    return root;
  };

  for (const collection of collections) {
    const known = remembered[collection.id];
    if (known && byId.has(known)) {
      resolved.set(collection.id, known);
      continue;
    }
    const parent = await rootFolder();
    const name = collection.name.trim() || collection.id;
    const existing = folders.find(
      (folder) => folder.parentId === parent.id && sameName(folder, name),
    );
    const folder = existing ?? (await store.createFolder(name, parent.id));
    folders.push(folder);
    byId.set(folder.id, folder);
    resolved.set(collection.id, folder.id);
  }

  const next = Object.fromEntries(resolved);
  const changed = Object.entries(next).some(
    ([collectionId, folderId]) => remembered[collectionId] !== folderId,
  );
  if (changed) {
    await store.rememberFolders(account.id, {
      collectionFolders: { ...remembered, ...next },
    });
  }
  return resolved;
}

/** Adds each save from a collection walk to that collection's Folder, keeping the Folders it already has. */
export async function fileCollectionSaves(
  account: Pick<ConnectedAccount, "id" | "source" | "sync">,
  entries: ReadonlyArray<CollectionEntry>,
  store: CollectionFolderStore = defaultStore,
  everyCollection: ReadonlyArray<ImportCollection> = [],
): Promise<number> {
  const scope = accountImportScope(account.source, account.sync);
  const filing = collectionFiling(account.source, scope);
  const collections =
    filing === "picked"
      ? (scope?.collections ?? [])
      : filing === "every"
        ? everyCollection
        : [];
  if (collections.length === 0) {
    return 0;
  }
  const tagged = mergeTags(entries);
  if (tagged.length === 0) {
    return 0;
  }

  const folderFor = await resolveCollectionFolders(account, collections, store);
  const saveIds = await store.saveIds(
    account.source,
    tagged.map((entry) => entry.sourceId),
  );
  const current = await store.folderIds([...saveIds.values()]);
  const assignments: Array<{ saveId: string; folderIds: Array<string> }> = [];
  for (const entry of tagged) {
    const saveId = saveIds.get(entry.sourceId);
    if (!saveId) {
      continue;
    }
    const have = current.get(saveId) ?? [];
    const add = new Set<string>();
    for (const collectionId of entry.collectionIds ?? []) {
      const folderId = folderFor.get(collectionId);
      if (folderId && !have.includes(folderId)) {
        add.add(folderId);
      }
    }
    if (add.size === 0) {
      continue;
    }
    assignments.push({ saveId, folderIds: [...have, ...add] });
  }
  if (assignments.length > 0) {
    await store.assign(assignments);
    log.info(
      `[pond sync:${account.source}] filed ${assignments.length} saves into collection Folders`,
    );
  }
  return assignments.length;
}

/** Filing is a convenience on top of the import, so a failure is logged and the sync still completes. */
export async function fileIntoFolders(
  account: Pick<ConnectedAccount, "id" | "source" | "sync">,
  entries: ReadonlyArray<CollectionEntry>,
  everyCollection: ReadonlyArray<ImportCollection> = [],
): Promise<void> {
  try {
    await fileCollectionSaves(account, entries, defaultStore, everyCollection);
  } catch (error) {
    log.warn(`[pond sync:${account.source}] filing into Folders failed`, error);
  }
}

/** A save can arrive from the list walk and from several collection walks in one run. */
function mergeTags(
  entries: ReadonlyArray<CollectionEntry>,
): Array<CollectionEntry> {
  const tags = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!entry.collectionIds?.length) {
      continue;
    }
    const ids = tags.get(entry.sourceId) ?? new Set<string>();
    for (const id of entry.collectionIds) {
      ids.add(id);
    }
    tags.set(entry.sourceId, ids);
  }
  return Array.from(tags, ([sourceId, ids]) => ({
    sourceId,
    collectionIds: [...ids],
  }));
}
