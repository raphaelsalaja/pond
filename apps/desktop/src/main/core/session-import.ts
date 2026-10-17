import {
  type ConnectedAccount,
  DEFAULT_SOURCE_SYNC_PREFS,
  type Source,
  type SourceSyncPrefs,
} from "@pond/schema/db";
import type {
  ExtensionCookie,
  SessionImportResponse,
} from "@pond/schema/session";
import { session } from "electron";
import log from "electron-log/main.js";
import { IPC } from "../../shared/constants";
import type { SessionImportFailureReason } from "../../shared/wire";
import { broadcast } from "../lib/broadcast";
import { clearPendingSessionSource } from "../pending-session";
import { extractorFor } from "./pipeline/extractors";
import {
  isAuthCookieName,
  primaryDomainForSource,
  probeUserHandle,
  writePartitionCookies,
} from "./refresh/harvest-window";
import { identityKeyFromCookies } from "./session-identity";
import { syncAccount } from "./sync";
import {
  createAccount,
  findAccountByHandle,
  findAccountByIdentityKey,
  listAccountsForSource,
  normalizeHandle,
  partitionForAccount,
  patchAccount,
} from "./sync/accounts";
import { fillMissingAvatars } from "./sync/avatars";

interface AccountIdentityPatch {
  identityKey?: string;
  handle?: string;
  avatarUrl?: string | null;
  avatarCheckedAt?: string;
}

function failedSessionImport(
  source: Source,
  reason: SessionImportFailureReason,
): SessionImportResponse {
  log.warn(`[pond session-import] ${source}: rejected (${reason})`);
  broadcast(IPC.sessionImportFailed, { source, reason });
  return { ok: false, imported: 0, connected: false, reason };
}

export async function importSessionCookies(
  source: Source,
  cookies: ExtensionCookie[],
): Promise<SessionImportResponse> {
  const domain = primaryDomainForSource(source);
  if (!domain) return failedSessionImport(source, "no_cookie_domain");

  const allowedHost = domain.replace(/^\./, "").toLowerCase();
  const filtered = cookies.filter((cookie: ExtensionCookie) => {
    const ck = cookie.domain.replace(/^\./, "").toLowerCase();
    return ck === allowedHost || ck.endsWith(`.${allowedHost}`);
  });

  if (filtered.length === 0) {
    return failedSessionImport(source, "no_cookies_for_source_domain");
  }

  if (
    !filtered.some((cookie) =>
      isAuthCookieName(source, cookie.name, cookie.value),
    )
  ) {
    return failedSessionImport(source, "no_auth_cookies_in_payload");
  }

  const identityKey = identityKeyFromCookies(source, filtered);
  const resolution = await resolveTargetAccount(source, filtered, identityKey);

  if (source === "reddit" && !resolution.probedHandle) {
    log.info(
      `[pond session-import] ${source}: cookies present but /api/me.json did not return a user`,
    );
    return failedSessionImport(source, "session_not_authenticated");
  }
  if (
    source === "cosmos" &&
    !resolution.probedHandle &&
    resolution.kind !== "identity_match"
  ) {
    log.info(
      `[pond session-import] ${source}: cookies present but GraphQL me did not return a user`,
    );
    return failedSessionImport(source, "session_not_authenticated");
  }
  const account = resolution.account;

  const { written, skipped } = await writePartitionCookies({
    cookies: filtered,
    partition: partitionForAccount(account.id),
  });
  log.info(
    `[pond session-import] ${source} → @${account.handle ?? "?"} (${account.id}, ${resolution.kind}): ` +
      `wrote ${written} (skipped ${skipped}, filtered out ${cookies.length - filtered.length})`,
  );

  const patch: AccountIdentityPatch = {};
  if (identityKey && account.identityKey !== identityKey) {
    patch.identityKey = identityKey;
  }
  if (resolution.probedHandle && resolution.probedHandle !== account.handle) {
    patch.handle = resolution.probedHandle;
  }
  if (source === "reddit") {
    const handle = resolution.probedHandle ?? account.handle;
    if (handle) {
      const { fetchRedditAvatar } = await import(
        "./refresh/harvest/reddit/api"
      );
      const avatarUrl = await fetchRedditAvatar(
        handle,
        partitionForAccount(account.id),
      );
      if (avatarUrl) {
        patch.avatarUrl = avatarUrl;
        patch.avatarCheckedAt = new Date().toISOString();
      }
    }
  }
  if (source === "cosmos") {
    const { fetchCosmosViewer } = await import("./refresh/harvest/cosmos/api");
    const viewer = await fetchCosmosViewer(partitionForAccount(account.id));
    if (viewer) {
      if (viewer.handle !== account.handle) patch.handle = viewer.handle;
      if (account.identityKey !== viewer.userId) {
        patch.identityKey = viewer.userId;
      }
      if (viewer.avatarUrl) {
        patch.avatarUrl = viewer.avatarUrl;
        patch.avatarCheckedAt = new Date().toISOString();
      }
    }
  }
  if (Object.keys(patch).length > 0) {
    await patchAccount(account.id, patch).catch((err) =>
      log.warn("[pond session-import] identity patch failed", err),
    );
  }

  void syncAccount(account.id, { trigger: "manual" }).catch((err) =>
    log.warn("[pond session-import] follow-up sync threw", source, err),
  );

  fillMissingAvatars();

  clearPendingSessionSource(source);

  broadcast(IPC.sessionImported, {
    source,
    accountId: account.id,
  });

  return {
    ok: true,
    imported: written,
    connected: true,
    accountId: account.id,
  };
}

interface AccountResolution {
  account: ConnectedAccount;
  kind: "identity_match" | "handle_match" | "reauth" | "created" | "ambiguous";
  probedHandle: string | null;
}

async function resolveTargetAccount(
  source: Source,
  cookies: ExtensionCookie[],
  identityKey: string | null,
): Promise<AccountResolution> {
  if (identityKey) {
    const matched = await findAccountByIdentityKey(source, identityKey);
    if (matched) {
      return { account: matched, kind: "identity_match", probedHandle: null };
    }
  }

  const accounts = await listAccountsForSource(source);

  let probedHandle: string | null = null;
  if (extractorFor(source)?.probeExpression) {
    probedHandle = await probeStagedHandle(source, cookies);
  }
  if (probedHandle) {
    const matched = await findAccountByHandle(source, probedHandle);
    if (matched) {
      return { account: matched, kind: "handle_match", probedHandle };
    }
  }

  const sole = accounts.length === 1 ? accounts[0] : undefined;
  if (
    sole &&
    sole.identityKey === null &&
    !(probedHandle && sole.handle && sole.handle !== probedHandle)
  ) {
    return { account: sole, kind: "reauth", probedHandle };
  }

  if (identityKey || probedHandle) {
    const account = await createAccount({
      source,
      handle: probedHandle,
      identityKey,
      sync: awaitingImportChoice(),
    });
    return { account, kind: "created", probedHandle };
  }

  if (accounts.length === 0) {
    const account = await createAccount({
      source,
      sync: awaitingImportChoice(),
    });
    return { account, kind: "created", probedHandle };
  }
  const first = accounts[0];
  if (!first) throw new Error("unreachable: accounts non-empty");
  if (accounts.length > 1) {
    log.warn(
      `[pond session-import] ${source}: ${accounts.length} accounts but the session carries no identity; assigning to the first`,
    );
    return { account: first, kind: "ambiguous", probedHandle };
  }
  return { account: first, kind: "reauth", probedHandle };
}

/** A new Account waits for you to choose what to import, so connecting never starts a full sync on its own. */
function awaitingImportChoice(): SourceSyncPrefs {
  return { ...DEFAULT_SOURCE_SYNC_PREFS, importPending: true };
}

async function probeStagedHandle(
  source: Source,
  cookies: ExtensionCookie[],
): Promise<string | null> {
  const staging = `pond-staging-${source}`;
  try {
    await session.fromPartition(staging).clearStorageData();
    await writePartitionCookies({ cookies, partition: staging });
    const handle = await probeUserHandle(source, staging);
    return normalizeHandle(handle);
  } catch (err) {
    log.warn("[pond session-import] staged probe failed", source, err);
    return null;
  } finally {
    void session
      .fromPartition(staging)
      .clearStorageData()
      .catch(() => {});
  }
}
