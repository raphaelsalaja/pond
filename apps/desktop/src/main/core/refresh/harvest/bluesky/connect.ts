import { DEFAULT_SOURCE_SYNC_PREFS } from "@pond/schema/db";
import log from "electron-log/main.js";
import { IPC } from "../../../../../shared/constants";
import { broadcast } from "../../../../lib/broadcast";
import { clearPendingSessionSource } from "../../../../pending-session";
import { syncAccount } from "../../../sync";
import {
  createAccount,
  findAccountByIdentityKey,
} from "../../../sync/accounts";
import { fillMissingAvatars } from "../../../sync/avatars";
import { publicGet, resolveProfile } from "./api";

export type ConnectResult =
  | { ok: true; accountId: string }
  | { ok: false; reason: "invalid" | "not_found" };

export interface NewHandleAccount {
  source: "bluesky";
  handle: string;
  identityKey: string;
}

export interface ConnectDeps {
  resolve(handle: string): Promise<{ did: string; handle: string } | null>;
  findByIdentity(did: string): Promise<{ id: string } | null>;
  create(account: NewHandleAccount): Promise<{ id: string }>;
  started(accountId: string): void;
}

const HANDLE =
  /^(?:did:[a-z]+:[A-Za-z0-9._:%-]+|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)$/;

/** A DID never changes, so it keys the Account; the handle is only what Pond shows. */
export async function connectByHandle(
  raw: string,
  deps: ConnectDeps,
): Promise<ConnectResult> {
  const trimmed = raw.trim().replace(/^@/, "");
  const handle = trimmed.startsWith("did:") ? trimmed : trimmed.toLowerCase();
  if (!HANDLE.test(handle)) {
    return { ok: false, reason: "invalid" };
  }
  const resolved = await deps.resolve(handle);
  if (!resolved) {
    return { ok: false, reason: "not_found" };
  }
  const existing = await deps.findByIdentity(resolved.did);
  const account =
    existing ??
    (await deps.create({
      source: "bluesky",
      handle: resolved.handle,
      identityKey: resolved.did,
    }));
  deps.started(account.id);
  return { ok: true, accountId: account.id };
}

export function liveConnectDeps(): ConnectDeps {
  return {
    resolve: (handle) => resolveProfile(publicGet(), handle),
    findByIdentity: (did) => findAccountByIdentityKey("bluesky", did),
    create: ({ source, handle, identityKey }) =>
      createAccount({
        source,
        handle,
        identityKey,
        sync: { ...DEFAULT_SOURCE_SYNC_PREFS, importPending: true },
      }),
    started: (accountId) => {
      void syncAccount(accountId, { trigger: "manual" }).catch(
        (cause: unknown) =>
          log.warn("[pond bluesky] follow-up sync threw", cause),
      );
      fillMissingAvatars();
      clearPendingSessionSource("bluesky");
      broadcast(IPC.sessionImported, { source: "bluesky", accountId });
    },
  };
}
