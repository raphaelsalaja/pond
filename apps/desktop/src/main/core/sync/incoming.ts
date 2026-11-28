import type { IncomingSaveRule, Source } from "@pond/schema/db";
import { getAccount, listAccountsForSource } from "./accounts";
import { getWatch, listWatches } from "./watches";

/**
 * The Account or Watch that owns saves arriving from one source.
 * An owned import uses that account or watch. A capture that names no owner
 * resolves only when this source has exactly one account, or exactly one
 * watch and no account, so two accounts never file each other's saves.
 */
export async function resolveIncomingOwner(
  ownerId: string | null | undefined,
  source: Source,
): Promise<{ id: string; incoming: IncomingSaveRule | undefined } | null> {
  if (ownerId) {
    const account = await getAccount(ownerId);
    if (account) {
      return account.source === source
        ? { id: account.id, incoming: account.sync.incoming }
        : null;
    }
    const watch = await getWatch(ownerId);
    if (watch) {
      return watch.source === source
        ? { id: watch.id, incoming: watch.sync.incoming }
        : null;
    }
    return null;
  }
  const accounts = await listAccountsForSource(source);
  if (accounts.length > 1) return null;
  const [account] = accounts;
  if (account) return { id: account.id, incoming: account.sync.incoming };
  const watches = (await listWatches()).filter(
    (watch) => watch.source === source,
  );
  const [watch] = watches;
  return watches.length === 1 && watch
    ? { id: watch.id, incoming: watch.sync.incoming }
    : null;
}
