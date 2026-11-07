import type { ConnectedAccount, ImportScope } from "@pond/schema/db";
import type { ImportCollectionOption } from "./import-scope";
import type {
  CancellableResult,
  EmptyInput,
  OkResult,
} from "./query-contracts-shared";

/** An Account or a Watch: both fetch on a schedule and own the saves they bring in. */
export interface SourceTargetInput {
  kind: "account" | "watch";
  id: string;
}

export interface AccountQueryInputs {
  "accounts.list": EmptyInput;
  "accounts.setHandle": { accountId: string; handle: string | null };
  "accounts.setLabel": { accountId: string; label: string | null };
  "accounts.importOptions": { accountId: string };
  "accounts.setImportScope": {
    accountId: string;
    scope: ImportScope;
    /** False saves a pending Account's choices and leaves it waiting for Start Import. */
    start?: boolean;
  };
  "accounts.disconnect": { accountId: string };
  "accounts.connectMymind": {
    kid: string;
    secret: string;
    accountId?: string;
  };
  "accounts.blueskySession": { accountId: string };
  "accounts.blueskySignIn": { accountId: string };
  "accounts.blueskySignOut": { accountId: string };
  "sources.setSchedule": SourceTargetInput & {
    paused: boolean;
    /** Null follows the global schedule. */
    intervalHours: number | null;
  };
  "sources.setIncoming": SourceTargetInput & {
    folderId: string | null;
    tags: string[];
  };
  "sources.overview": { id: string };
  "sources.extensionLastSeen": EmptyInput;
}

export interface SourceOverview {
  saves: number;
  bytes: number;
  /** Newest first. */
  recent: string[];
}

export interface AccountQueryResults {
  "accounts.list": {
    accounts: (ConnectedAccount & { connected: boolean; syncing: boolean })[];
  };
  "accounts.setHandle": OkResult<{ account: ConnectedAccount }>;
  "accounts.setLabel": OkResult<{ account: ConnectedAccount }>;
  /** `collections` is null when the Source can only import everything on that list. */
  "accounts.importOptions": OkResult<{
    collections: ImportCollectionOption[] | null;
  }>;
  "accounts.setImportScope": OkResult;
  "accounts.disconnect": OkResult;
  "accounts.connectMymind": OkResult<{ account: ConnectedAccount }>;
  /** Whether Pond's bsky.app page is signed in as this Account, which Bookmarks need and likes don't. */
  "accounts.blueskySession": OkResult<{
    signedIn: boolean;
    handle: string | null;
  }>;
  "accounts.blueskySignIn": CancellableResult<{ handle: string | null }>;
  "accounts.blueskySignOut": OkResult;
  "sources.setSchedule": OkResult;
  "sources.setIncoming": OkResult;
  "sources.overview": SourceOverview;
  /** Epoch ms of the last native message from any browser extension, or null since launch. */
  "sources.extensionLastSeen": { at: number | null };
}
