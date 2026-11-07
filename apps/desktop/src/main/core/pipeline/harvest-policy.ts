import type { SaveStatus } from "@pond/schema/db";

export function harvestShouldIgnoreSave(save: {
  status: SaveStatus;
  deletedAt: Date | null;
}): boolean {
  return save.status === "skipped" || save.deletedAt != null;
}

/** Saving a trashed page again asks for it back; background runs such as sync leave it in Trash. */
export function harvestShouldRestoreSave(
  save: { status: SaveStatus; deletedAt: Date | null },
  interactive: boolean,
): boolean {
  return interactive && save.deletedAt != null && save.status !== "skipped";
}

/** A reconnected account can take ownership of Saves from a disconnected account. */
export function harvestShouldAdoptSave(
  save: { accountId: string | null },
  accountId: string | undefined,
  connectedAccountIds: ReadonlySet<string>,
  adoptOrphaned = true,
): boolean {
  if (!adoptOrphaned) return false;
  if (!accountId || save.accountId === null) return false;
  if (save.accountId === accountId) return false;
  return !connectedAccountIds.has(save.accountId);
}

export function harvestShouldReseedFailedSave(
  save: {
    status: SaveStatus;
    deletedAt: Date | null;
  },
  hasSeed: boolean,
): boolean {
  return hasSeed && save.status === "failed" && !harvestShouldIgnoreSave(save);
}
