import type {
  Op,
  Prefs,
  Save,
  Source,
  SyncAction,
  TaskDeferredReason,
  TaskStatus,
} from "@pond/schema/db";

export type WireJson =
  | string
  | number
  | boolean
  | null
  | Date
  | readonly WireJson[]
  | { readonly [key: string]: WireJson | undefined };

export interface WireRow {
  readonly [key: string]: WireJson | undefined;
}

/** `interface` types get no implicit index signature, so `WireRow` cannot describe these. */

export type WirePrefsPatch = { [K in keyof Prefs]?: Partial<Prefs[K]> };

export interface WireTask {
  op: Op;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  generationId?: string | null;
  deferredReason?: TaskDeferredReason | null;
  lastError: string | null;
  nextRunAt: number;
  leaseExpiresAt?: number | null;
  failedAt?: number | null;
  completedAt?: number | null;
  updatedAt: number;
  interactive?: boolean;
}

export type WireSaveRow = Omit<
  Save,
  "embedding" | "clipEmbedding" | "transcript" | "rawSlim"
>;

export type WireSave = Omit<
  WireSaveRow,
  | "savedAt"
  | "createdAt"
  | "deletedAt"
  | "publishedAt"
  | "takenAt"
  | "ingestStartedAt"
  | "ingestCompletedAt"
> & {
  savedAt: number;
  createdAt: number;
  deletedAt: number | null;
  publishedAt: number | null;
  takenAt: number | null;
  ingestStartedAt: number | null;
  ingestCompletedAt: number | null;
  tasks?: WireTask[];
};

export type WireSyncPayload = WireRow | readonly WireRow[] | null;

export type WireSyncAction = Omit<
  SyncAction,
  "createdAt" | "data" | "prevData"
> & {
  createdAt: number;
  data: WireSyncPayload;
  prevData: WireSyncPayload;
};

export type WireSyncState =
  | "idle"
  | "running"
  | "done"
  | "error"
  | "auth_required"
  | "paused";

export interface WireSessionImported {
  source: Source;
  accountId: string;
}

export type SessionImportFailureReason =
  | "no_cookie_domain"
  | "no_cookies_for_source_domain"
  | "no_auth_cookies_in_payload"
  | "session_not_authenticated";

export interface WireSessionImportFailed {
  source: Source;
  reason: SessionImportFailureReason;
}

export interface WireSyncStatusUpdate {
  accountId: string;
  source: Source;
  state: WireSyncState;
  message?: string;
  progress?: { current: number; total: number };
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

export interface WireUndoState {
  ok: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

/** `stale` means newer changes sit above the step, so reversing it would skip them. */
export type UndoStepOutcome = "done" | "stale" | "failed";

export interface WireUndoStepState {
  outcome: UndoStepOutcome;
  canUndo: boolean;
  canRedo: boolean;
}
