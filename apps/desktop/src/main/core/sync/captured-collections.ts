import type {
  ConnectedAccount,
  ImportCollection,
  Source,
} from "@pond/schema/db";
import {
  accountImportScope,
  collectionFiling,
} from "../../../shared/import-scope";
import { listSourceCollections } from "../refresh/harvest-window";
import { resolveAccountHandle } from "./account-key";
import { listAccountsForSource, partitionForAccount } from "./accounts";
import { fileCollectionSaves } from "./collection-folders";
import type { CollectionEntry } from "./collection-folders";

export interface CapturedCollectionDeps {
  accounts: (source: Source) => Promise<Array<ConnectedAccount>>;
  /** The Account's collections with their names, or null when they can't be read. */
  listCollections: (
    account: ConnectedAccount,
  ) => Promise<Array<ImportCollection> | null>;
  file: (
    account: ConnectedAccount,
    entries: ReadonlyArray<CollectionEntry>,
    everyCollection: ReadonlyArray<ImportCollection>,
  ) => Promise<number>;
}

const defaultDeps: CapturedCollectionDeps = {
  accounts: listAccountsForSource,
  async listCollections(account) {
    const listed = await listSourceCollections(account.source, {
      partition: partitionForAccount(account.id),
      accountKey: (await resolveAccountHandle(account)) ?? undefined,
    });
    return listed.ok
      ? listed.collections.map(({ id, name }) => ({ id, name }))
      : null;
  },
  file: (account, entries, everyCollection) =>
    fileCollectionSaves(account, entries, undefined, everyCollection),
};

/**
 * Files a Save a site hook saw you add to collections, so it reaches its
 * Folders without waiting for the next Sync to walk them. A capture names no
 * Account, so this runs only when the Source has exactly one, as incoming
 * rules do, and two Accounts never file each other's Saves.
 */
export async function fileCapturedCollections(
  save: { source: Source; sourceId: string },
  collectionIds: ReadonlyArray<string>,
  deps: CapturedCollectionDeps = defaultDeps,
): Promise<number> {
  if (collectionIds.length === 0) return 0;
  const accounts = await deps.accounts(save.source);
  const account = accounts.length === 1 ? accounts[0] : undefined;
  if (!account) return 0;
  const filing = collectionFiling(
    account.source,
    accountImportScope(account.source, account.sync),
  );
  if (filing === "off") return 0;
  const entries = [
    { sourceId: save.sourceId, collectionIds: [...collectionIds] },
  ];
  if (filing === "picked") return deps.file(account, entries, []);

  /** A new collection needs its name for its Folder, so the Account's list is read only then. */
  const remembered = account.sync.collectionFolders ?? {};
  const listed = collectionIds.every((id) => remembered[id])
    ? []
    : ((await deps.listCollections(account)) ?? []);
  const everyCollection = collectionIds.flatMap((id) => {
    const named = listed.find((collection) => collection.id === id);
    if (named) return [named];
    return remembered[id] ? [{ id, name: id }] : [];
  });
  if (everyCollection.length === 0) return 0;
  return deps.file(account, entries, everyCollection);
}
