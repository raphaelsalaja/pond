import {
  type IncomingSaveRule,
  type Source,
  saveFolders,
} from "@pond/schema/db";
import { inArray } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { assignSaveFolders, listFolders } from "../folders";
import { addTagsToSaves } from "../tags";
import { getAccount, listAccountsForSource } from "./accounts";
import { getWatch, listWatches } from "./watches";

const CHUNK = 500;

async function addToFolder(
  saveIds: readonly string[],
  folderId: string,
): Promise<void> {
  if (!(await listFolders()).some((folder) => folder.id === folderId)) return;
  const db = await getDb();
  for (let offset = 0; offset < saveIds.length; offset += CHUNK) {
    const batch = saveIds.slice(offset, offset + CHUNK);
    const rows = await db
      .select({ saveId: saveFolders.saveId, folderId: saveFolders.folderId })
      .from(saveFolders)
      .where(inArray(saveFolders.saveId, batch));
    const have = new Map<string, string[]>();
    for (const row of rows) {
      have.set(row.saveId, [...(have.get(row.saveId) ?? []), row.folderId]);
    }
    const assignments = batch
      .filter((saveId) => !have.get(saveId)?.includes(folderId))
      .map((saveId) => ({
        saveId,
        folderIds: [...(have.get(saveId) ?? []), folderId],
      }));
    if (assignments.length > 0) await assignSaveFolders(assignments, false);
  }
}

/**
 * Folder and tags for saves that just arrived from one source.
 * An owned import uses that account or watch. A capture that names no owner
 * uses the rule only when this source has exactly one account, or exactly one
 * watch and no account, so two accounts never file each other's saves.
 */
async function incomingRuleFor(
  ownerId: string | null | undefined,
  source: Source,
): Promise<IncomingSaveRule | undefined> {
  if (ownerId) {
    const account = await getAccount(ownerId);
    if (account)
      return account.source === source ? account.sync.incoming : undefined;
    const watch = await getWatch(ownerId);
    if (watch) return watch.source === source ? watch.sync.incoming : undefined;
    return undefined;
  }
  const accounts = await listAccountsForSource(source);
  if (accounts.length === 1) return accounts[0]?.sync.incoming;
  if (accounts.length > 1) return undefined;
  const watches = (await listWatches()).filter(
    (watch) => watch.source === source,
  );
  return watches.length === 1 ? watches[0]?.sync.incoming : undefined;
}

export async function fileIncomingSaves(
  saveIds: readonly string[],
  ownerId: string | null | undefined,
  source: Source,
  trigger: string,
): Promise<void> {
  await organizeIncoming(
    saveIds,
    await incomingRuleFor(ownerId, source),
    trigger,
  );
}

/** Filing is a convenience on top of the import, so a failure is logged and the sync still completes. */
export async function organizeIncoming(
  saveIds: readonly string[],
  rule: IncomingSaveRule | undefined,
  trigger: string,
): Promise<void> {
  if (!rule || saveIds.length === 0) return;
  try {
    if (rule.folderId) await addToFolder(saveIds, rule.folderId);
    if (rule.tags?.length) {
      await addTagsToSaves(saveIds, rule.tags, `${trigger}:incoming-tags`);
    }
  } catch (error) {
    log.warn(`[pond ${trigger}] filing incoming saves failed`, error);
  }
}
