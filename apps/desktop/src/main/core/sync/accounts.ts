import {
  type ConnectedAccount,
  DEFAULT_SOURCE_SYNC_PREFS,
  type Source,
  type SourceSyncPrefs,
} from "@pond/schema/db";
import { session } from "electron";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { removeMymindCredential } from "../mymind/credentials";
import { getPrefs, setPrefs } from "../prefs";
import { cancelSync } from "./sync-status";

export const LEGACY_PARTITION = "persist:pond-scrapers";

/** Each connected account owns an isolated Electron session partition so two accounts on the same platform never clobber each other's cookies. */
export function partitionForAccount(accountId: string): string {
  return `persist:pond-acct-${accountId}`;
}

export async function listAccounts(): Promise<ConnectedAccount[]> {
  const prefs = await getPrefs();
  return Object.values(prefs.sync.accounts ?? {}).sort((a, b) =>
    a.addedAt.localeCompare(b.addedAt),
  );
}

export async function listAccountsForSource(
  source: Source,
): Promise<ConnectedAccount[]> {
  return (await listAccounts()).filter((a) => a.source === source);
}

export async function getAccount(
  accountId: string,
): Promise<ConnectedAccount | null> {
  const prefs = await getPrefs();
  return prefs.sync.accounts?.[accountId] ?? null;
}

export async function findAccountByHandle(
  source: Source,
  handle: string,
): Promise<ConnectedAccount | null> {
  const wanted = normalizeHandle(handle);
  if (!wanted) return null;
  const accounts = await listAccountsForSource(source);
  return (
    accounts.find((a) => normalizeHandle(a.handle ?? "") === wanted) ?? null
  );
}

export async function createAccount(args: {
  source: Source;
  handle?: string | null;
  identityKey?: string | null;
  label?: string | null;
  sync?: SourceSyncPrefs;
  id?: string;
}): Promise<ConnectedAccount> {
  const account: ConnectedAccount = {
    id: args.id ?? ulid(),
    source: args.source,
    handle: normalizeHandle(args.handle ?? null),
    identityKey: args.identityKey ?? null,
    label: args.label ?? null,
    addedAt: new Date().toISOString(),
    sync: args.sync ?? { ...DEFAULT_SOURCE_SYNC_PREFS },
  };
  await writeAccounts((accounts) => ({ ...accounts, [account.id]: account }));
  log.info(
    `[pond accounts] created ${account.source} account`,
    account.id,
    account.handle ?? "(handle unknown)",
  );
  return account;
}

export async function findAccountByIdentityKey(
  source: Source,
  identityKey: string,
): Promise<ConnectedAccount | null> {
  const accounts = await listAccountsForSource(source);
  return accounts.find((a) => a.identityKey === identityKey) ?? null;
}

export async function patchAccount(
  accountId: string,
  patch: Partial<
    Pick<
      ConnectedAccount,
      "handle" | "label" | "identityKey" | "avatarUrl" | "avatarCheckedAt"
    >
  >,
): Promise<ConnectedAccount | null> {
  let updated: ConnectedAccount | null = null;
  await writeAccounts((accounts) => {
    const current = accounts[accountId];
    if (!current) return accounts;
    updated = {
      ...current,
      ...patch,
      handle:
        patch.handle !== undefined
          ? normalizeHandle(patch.handle)
          : current.handle,
    };
    return { ...accounts, [accountId]: updated };
  });
  return updated;
}

export async function getAccountSync(
  accountId: string,
): Promise<SourceSyncPrefs> {
  const account = await getAccount(accountId);
  return { ...DEFAULT_SOURCE_SYNC_PREFS, ...account?.sync };
}

export async function patchAccountSync(
  accountId: string,
  patch: Partial<SourceSyncPrefs>,
): Promise<SourceSyncPrefs> {
  let next: SourceSyncPrefs = { ...DEFAULT_SOURCE_SYNC_PREFS, ...patch };
  await writeAccounts((accounts) => {
    const current = accounts[accountId];
    if (!current) return accounts;
    next = { ...DEFAULT_SOURCE_SYNC_PREFS, ...current.sync, ...patch };
    return { ...accounts, [accountId]: { ...current, sync: next } };
  });
  return next;
}

export async function removeAccount(accountId: string): Promise<void> {
  const account = await getAccount(accountId);
  if (account?.source === "mymind") cancelSync(accountId);
  await writeAccounts((accounts) => {
    if (!accounts[accountId]) return accounts;
    const next = { ...accounts };
    delete next[accountId];
    return next;
  });
  if (account?.source === "mymind") await removeMymindCredential(accountId);
  try {
    await session
      .fromPartition(partitionForAccount(accountId))
      .clearStorageData();
  } catch (err) {
    log.warn("[pond accounts] partition wipe failed", accountId, err);
  }
}

export async function partitionForIngest(
  source: Source,
  accountId?: string | null,
): Promise<string> {
  if (accountId) {
    const account = await getAccount(accountId);
    if (account?.source === source) return partitionForAccount(account.id);
  }
  const accounts = await listAccountsForSource(source);
  const first = accounts[0];
  return first ? partitionForAccount(first.id) : LEGACY_PARTITION;
}

export function normalizeHandle(handle: string | null): string | null {
  if (handle === null) return null;
  const trimmed = handle.trim().replace(/^@/, "");
  return trimmed.length > 0 ? trimmed : null;
}

async function writeAccounts(
  update: (
    accounts: Record<string, ConnectedAccount>,
  ) => Record<string, ConnectedAccount>,
): Promise<void> {
  const prefs = await getPrefs();
  const current = prefs.sync.accounts ?? {};
  const next = update(current);
  if (next === current) return;
  await setPrefs({ sync: { accounts: next } });
}
