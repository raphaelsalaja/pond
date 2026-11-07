import {
  type ConnectedAccount,
  DEFAULT_SOURCE_SYNC_PREFS,
} from "@pond/schema/db";
import type { OkResult } from "@shared/query-contracts-shared";
import { ulid } from "ulid";
import { libraryRoot } from "../../paths";
import { createAccount, getAccount, patchAccountSync } from "../sync/accounts";
import { isSyncing } from "../sync/sync-status";
import type { MymindCredential } from "./client";
import { removeMymindCredential, writeMymindCredential } from "./credentials";
import {
  createMymindSyncState,
  readMymindSyncState,
  removeMymindSyncState,
  writeMymindSyncState,
} from "./state";
import { createConnectedMymindClient } from "./transport";

interface ConnectInput extends MymindCredential {
  accountId?: string;
}

interface ConnectDependencies {
  root: () => string;
  now: () => number;
  newId: () => string;
  getAccount: typeof getAccount;
  isSyncing: typeof isSyncing;
  validate: (credential: MymindCredential) => Promise<void>;
  readState: typeof readMymindSyncState;
  writeState: typeof writeMymindSyncState;
  removeState: typeof removeMymindSyncState;
  writeCredential: typeof writeMymindCredential;
  removeCredential: typeof removeMymindCredential;
  createAccount: typeof createAccount;
  patchAccountSync: typeof patchAccountSync;
}

const defaultDependencies: ConnectDependencies = {
  root: libraryRoot,
  now: Date.now,
  newId: ulid,
  getAccount,
  isSyncing,
  validate: (credential) =>
    createConnectedMymindClient(credential).validateCredential(),
  readState: readMymindSyncState,
  writeState: writeMymindSyncState,
  removeState: removeMymindSyncState,
  writeCredential: writeMymindCredential,
  removeCredential: removeMymindCredential,
  createAccount,
  patchAccountSync,
};

const connectingAccounts = new Set<string>();

export function isMymindConnecting(accountId: string): boolean {
  return connectingAccounts.has(accountId);
}

export async function connectMymind(
  input: ConnectInput,
  dependencies: ConnectDependencies = defaultDependencies,
): Promise<OkResult<{ account: ConnectedAccount }>> {
  const root = dependencies.root();
  const existing = input.accountId
    ? await dependencies.getAccount(input.accountId)
    : null;
  if (input.accountId && existing?.source !== "mymind")
    return { ok: false, error: "mymind Account not found." };
  if (
    existing &&
    (dependencies.isSyncing(existing.id) || isMymindConnecting(existing.id))
  )
    return { ok: false, error: "Stop the mymind import before reconnecting." };

  if (existing) connectingAccounts.add(existing.id);
  try {
    const credential = { kid: input.kid, secret: input.secret };
    await dependencies.validate(credential);
    if (dependencies.root() !== root)
      return { ok: false, error: "The Library changed. Connect mymind again." };

    if (existing) {
      // A new key must keep the first connection's import start time.
      await dependencies.readState(root, existing.id);
      const current = await dependencies.getAccount(existing.id);
      if (dependencies.root() !== root)
        return {
          ok: false,
          error: "The Library changed. Connect mymind again.",
        };
      if (current?.source !== "mymind")
        return { ok: false, error: "mymind Account not found." };
      if (dependencies.isSyncing(existing.id))
        return {
          ok: false,
          error: "Stop the mymind import before reconnecting.",
        };
      await dependencies.writeCredential(existing.id, credential);
      const connected = await dependencies.getAccount(existing.id);
      if (dependencies.root() !== root)
        return {
          ok: false,
          error: "The Library changed. Connect mymind again.",
        };
      if (!connected) {
        await dependencies.removeCredential(existing.id);
        return { ok: false, error: "mymind Account not found." };
      }
      await dependencies.patchAccountSync(existing.id, {
        lastError: null,
      });
      const account = await dependencies.getAccount(existing.id);
      if (dependencies.root() !== root)
        return {
          ok: false,
          error: "The Library changed. Connect mymind again.",
        };
      if (!account) {
        await dependencies.removeCredential(existing.id);
        return { ok: false, error: "mymind Account not found." };
      }
      return { ok: true, account };
    }

    const id = dependencies.newId();
    const state = createMymindSyncState(dependencies.now());
    let created = false;
    try {
      await dependencies.writeState(root, id, state);
      await dependencies.writeCredential(id, credential);
      if (dependencies.root() !== root)
        return {
          ok: false,
          error: "The Library changed. Connect mymind again.",
        };
      const account = await dependencies.createAccount({
        id,
        source: "mymind",
        label: "mymind",
        sync: { ...DEFAULT_SOURCE_SYNC_PREFS, lastFullSyncAt: state.startedAt },
      });
      created = true;
      return { ok: true, account };
    } finally {
      if (!created) {
        await dependencies.removeCredential(id);
        await dependencies.removeState(root, id);
      }
    }
  } finally {
    if (existing) connectingAccounts.delete(existing.id);
  }
}
