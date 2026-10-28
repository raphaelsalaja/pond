import { IMPORT_MEDIA_KINDS } from "@pond/schema/db";
import { LIST_KINDS } from "@pond/schema/list-kinds";
import { sourceLabel } from "@pond/schema/sources";
import { z } from "zod";
import {
  type ImportCollectionKind,
  type ImportScopeProblem,
  importScopeOptions,
  importsAnyList,
  normalizeImportScope,
} from "../../../shared/import-scope";
import type { OkFailure } from "../../../shared/query-contracts-shared";
import { releaseFilteredSaves } from "../../core/pipeline/import-filter";
import type { CollectionFailureReason } from "../../core/refresh/harvest/lib/collections-reply";
import {
  collectionsNeedHandle,
  isAccountConnected,
  listSourceCollections,
} from "../../core/refresh/harvest-window";
import { isSyncing, syncAccount } from "../../core/sync";
import { resolveAccountHandle } from "../../core/sync/account-key";
import {
  getAccount,
  listAccounts,
  partitionForAccount,
  patchAccount,
  patchAccountSync,
  removeAccount,
} from "../../core/sync/accounts";
import { fillMissingAvatars } from "../../core/sync/avatars";
import { importScopePatch } from "../../core/sync/import-scope";
import { countSavesForAccount } from "../../core/sync/sync-baseline";
import {
  type QueryHandlerMap,
  query,
  StringParam,
  TrimmedTextParam,
} from "./params";

const ACCOUNT_NOT_FOUND: OkFailure = { ok: false, error: "Account not found." };
/** Plural nouns for the collections each Source names differently. */
const COLLECTION_NOUNS = {
  board: "boards",
  collection: "collections",
  folder: "folders",
  playlist: "playlists",
} satisfies Record<ImportCollectionKind, string>;

function importScopeProblem(
  problem: ImportScopeProblem,
  kind: ImportCollectionKind | null,
): string {
  switch (problem) {
    case "no_lists":
      return "Choose at least one list to import.";
    case "no_collections":
      return `Choose at least one of your ${COLLECTION_NOUNS[kind ?? "collection"]} to import.`;
    case "no_media":
      return "Choose at least one post type to import.";
    case "bad_since":
      return "Enter a real date to import from.";
  }
}

const ImportScopeParam = z.strictObject({
  listKinds: z.array(z.enum(LIST_KINDS)).max(LIST_KINDS.length).optional(),
  collections: z
    .array(
      z.strictObject({
        id: z.string().trim().min(1).max(64),
        name: z.string().trim().max(200),
      }),
    )
    .max(500)
    .optional(),
  mediaKinds: z
    .array(z.enum(IMPORT_MEDIA_KINDS))
    .max(IMPORT_MEDIA_KINDS.length)
    .optional(),
  since: z.string().trim().max(10).optional(),
  addToFolders: z.boolean().optional(),
});

interface SetImportScopeDependencies {
  getAccount: typeof getAccount;
  patchAccountSync: typeof patchAccountSync;
  releaseFilteredSaves: (accountId: string) => Promise<number>;
}

export function createSetImportScopeQuery(
  dependencies: SetImportScopeDependencies = {
    getAccount,
    patchAccountSync,
    releaseFilteredSaves,
  },
) {
  return query(
    z.strictObject({
      accountId: z.string().trim().min(1),
      scope: ImportScopeParam,
      start: z.boolean().optional(),
    }),
    async (params) => {
      const account = await dependencies.getAccount(params.accountId);
      if (!account) return ACCOUNT_NOT_FOUND;
      const normalized = normalizeImportScope(account.source, params.scope);
      if (!normalized.ok) {
        return {
          ok: false as const,
          error: importScopeProblem(
            normalized.problem,
            importScopeOptions(account.source).collections,
          ),
        };
      }
      /** A saved Account may keep every list off, but a first import needs one. */
      if (params.start && !importsAnyList(account.source, normalized.scope)) {
        return {
          ok: false as const,
          error: importScopeProblem("no_lists", null),
        };
      }
      const patch = importScopePatch(
        account.source,
        account.sync,
        normalized.scope,
        { start: params.start },
      );
      await dependencies.patchAccountSync(params.accountId, patch);
      if (patch.lastFullSyncAt === null) {
        await dependencies.releaseFilteredSaves(params.accountId);
      }
      return { ok: true as const };
    },
  );
}

function collectionsProblem(
  reason: CollectionFailureReason,
  label: string,
  nouns: string,
): string {
  switch (reason) {
    case "auth_required":
      return `${label} signed you out. Reconnect the Account to load your ${nouns}.`;
    case "checkpoint":
      return `${label} wants you to confirm your account. Open ${label} in your browser, then try again.`;
    case "rate_limited":
      return `${label} asked Pond to slow down. Try again in a few minutes.`;
    case "unknown":
      return `Pond couldn't load your ${nouns}. Try again.`;
  }
}

interface ImportOptionsDependencies {
  getAccount: typeof getAccount;
  resolveAccountHandle: typeof resolveAccountHandle;
  listSourceCollections: typeof listSourceCollections;
}

export function createImportOptionsQuery(
  dependencies: ImportOptionsDependencies = {
    getAccount,
    resolveAccountHandle,
    listSourceCollections,
  },
) {
  return query(
    z.strictObject({ accountId: z.string().trim().min(1) }),
    async (params) => {
      const account = await dependencies.getAccount(params.accountId);
      if (!account) return ACCOUNT_NOT_FOUND;
      const kind = importScopeOptions(account.source).collections;
      if (!kind) return { ok: true as const, collections: null };
      const label = sourceLabel(account.source);
      const nouns = COLLECTION_NOUNS[kind];
      const needsHandle = collectionsNeedHandle(account.source);
      const handle = needsHandle
        ? await dependencies.resolveAccountHandle(account)
        : null;
      if (needsHandle && !handle) {
        return {
          ok: false as const,
          error: `Pond couldn't find your ${label} username. Reconnect the Account and try again.`,
        };
      }
      const result = await dependencies.listSourceCollections(account.source, {
        partition: partitionForAccount(account.id),
        accountKey: handle ?? undefined,
      });
      if (!result.ok) {
        return {
          ok: false as const,
          error: collectionsProblem(result.reason, label, nouns),
        };
      }
      return { ok: true as const, collections: result.collections };
    },
  );
}

export const accountsQueries = {
  async "accounts.list"() {
    fillMissingAvatars();
    const accounts = await listAccounts();
    const rows = await Promise.all(
      accounts.map(async (account) => {
        const knownCount = await countSavesForAccount(account).catch(
          () => account.sync.knownCount,
        );
        return {
          ...account,
          sync: { ...account.sync, knownCount },
          connected: await isAccountConnected(account).catch(() => false),
          syncing: isSyncing(account.id),
        };
      }),
    );
    return { accounts: rows };
  },

  "accounts.setHandle": query(
    z.object({ accountId: StringParam, handle: TrimmedTextParam }),
    async (params) => {
      const account = await patchAccount(params.accountId, {
        handle: params.handle,
        avatarUrl: null,
        avatarCheckedAt: null,
      });
      if (!account) return ACCOUNT_NOT_FOUND;
      fillMissingAvatars();
      return { ok: true as const, account };
    },
  ),

  "accounts.setLabel": query(
    z.object({ accountId: StringParam, label: TrimmedTextParam }),
    async (params) => {
      const account = await patchAccount(params.accountId, {
        label: params.label,
      });
      return account ? { ok: true as const, account } : ACCOUNT_NOT_FOUND;
    },
  ),

  "accounts.importOptions": createImportOptionsQuery(),

  "accounts.setImportScope": createSetImportScopeQuery(),

  "accounts.disconnect": query(
    z.object({ accountId: StringParam }),
    async (params) => {
      const account = await getAccount(params.accountId);
      if (!account) return ACCOUNT_NOT_FOUND;
      await removeAccount(params.accountId);
      return { ok: true as const };
    },
  ),

  "accounts.blueskySession": query(
    z.object({ accountId: StringParam }),
    async (params) => {
      const account = await getAccount(params.accountId);
      if (account?.source !== "bluesky") return ACCOUNT_NOT_FOUND;
      const { blueskySessionStatus } = await import(
        "../../core/refresh/harvest/bluesky/session"
      );
      const status = await blueskySessionStatus(account);
      return {
        ok: true as const,
        signedIn: status.signedIn,
        handle: status.signedIn ? status.handle : null,
      };
    },
  ),

  "accounts.blueskySignIn": query(
    z.object({ accountId: StringParam }),
    async (params) => {
      const account = await getAccount(params.accountId);
      if (account?.source !== "bluesky") return ACCOUNT_NOT_FOUND;
      const { signInToBluesky } = await import(
        "../../core/refresh/harvest/bluesky/session"
      );
      const result = await signInToBluesky(account);
      if (result.ok) {
        void syncAccount(account.id, { trigger: "manual" }).catch(() => {});
        return { ok: true as const, handle: result.handle };
      }
      if (result.reason === "cancelled") {
        return { ok: false as const, reason: "cancelled" as const };
      }
      return {
        ok: false as const,
        error: `You signed in as @${result.otherHandle}. Sign in as @${account.handle ?? "this Account"} to import its bookmarks.`,
      };
    },
  ),

  "accounts.blueskySignOut": query(
    z.object({ accountId: StringParam }),
    async (params) => {
      const account = await getAccount(params.accountId);
      if (account?.source !== "bluesky") return ACCOUNT_NOT_FOUND;
      const { signOutOfBluesky } = await import(
        "../../core/refresh/harvest/bluesky/session"
      );
      await signOutOfBluesky(account);
      return { ok: true as const };
    },
  ),
} satisfies QueryHandlerMap;
