import type { Source } from "@pond/schema/db";

export interface ConnectArrivalAccount {
  id: string;
  source: Source;
  connected: boolean;
}

export function findArrivedAccount<T extends ConnectArrivalAccount>(
  list: ReadonlyArray<T>,
  source: Source,
  connectedBefore: ReadonlySet<string>,
  importedAccountId?: string | null,
): T | undefined {
  if (importedAccountId) {
    const imported = list.find(
      (account) =>
        account.id === importedAccountId && account.source === source,
    );
    if (imported) return imported;
  }
  return list.find(
    (account) =>
      account.source === source &&
      account.connected &&
      !connectedBefore.has(account.id),
  );
}
