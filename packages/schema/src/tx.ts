import type { NewSave, NewTag, Save, SyncAction, Tag } from "./db";

/**
 * The transaction union — THE single write vocabulary for pond.
 *
 * Everything that mutates state (HTTP ingest, Save-card edits, tag merges,
 * AI enrichment, file-system scans) becomes one of these and goes through
 * the TransactionExecutor in main.
 *
 * See plan § "Transactions, Object Pool & sync actions".
 */

export type ActorKind = "user" | "ai" | "system";

export interface TxMeta {
  /** Who initiated the write. Surfaces in the activity feed + sync_actions. */
  actor?: ActorKind;
  /** Optional free-text reason (e.g. "ai-enrichment"). */
  actorReason?: string;
  /** Stable id linking together related transactions (e.g. a batch). */
  batchId?: string;
  /** Skip broadcasting to renderer. Used by startup replay. */
  silent?: boolean;
}

/** Side file included with a `create` or `update` save transaction. */
export interface TxSaveFile {
  /** Relative filename inside `items/<id>.info/`. */
  filename: string;
  /** Raw bytes as a base64 string. Uses base64 because IPC structured clone
   * handles Uint8Array but cross-process JSON envelopes (HTTP) do not. */
  base64: string;
  /** Content-type hint used by the renderer + custom protocol. */
  mimeType?: string;
}

export type Transaction =
  | {
      kind: "create";
      model: "save";
      id: string;
      data: NewSave;
      files?: TxSaveFile[];
      meta?: TxMeta;
    }
  | {
      kind: "update";
      model: "save";
      id: string;
      patch: Partial<NewSave>;
      before: Partial<Save>;
      files?: TxSaveFile[];
      meta?: TxMeta;
    }
  | {
      kind: "delete";
      model: "save";
      id: string;
      before: Save;
      meta?: TxMeta;
    }
  /** Soft-delete: stamps `deletedAt`, moves on-disk folder into `trash/`. */
  | {
      kind: "trash";
      model: "save";
      id: string;
      meta?: TxMeta;
    }
  /** Restore from trash: clears `deletedAt`, moves folder back to `items/`. */
  | {
      kind: "untrash";
      model: "save";
      id: string;
      meta?: TxMeta;
    }
  /**
   * Hard delete from trash. Removes the SQLite row AND the on-disk folder
   * (under `trash/`). `before` is captured so undo can resurrect the
   * row, but the on-disk bytes are gone — undo will produce a metadata
   * shell without the original media files.
   */
  | {
      kind: "purge";
      model: "save";
      id: string;
      before: Save;
      meta?: TxMeta;
    }
  /**
   * @deprecated alias of `trash`. Kept so any persisted undo entries from
   * a previous build still parse. New writers should emit `trash`.
   */
  | {
      kind: "archive";
      model: "save";
      id: string;
      meta?: TxMeta;
    }
  /** @deprecated alias of `untrash`. See `archive`. */
  | {
      kind: "unarchive";
      model: "save";
      id: string;
      meta?: TxMeta;
    }
  | {
      kind: "create";
      model: "tag";
      id: string;
      data: NewTag;
      meta?: TxMeta;
    }
  | {
      kind: "update";
      model: "tag";
      id: string;
      patch: Partial<NewTag>;
      before: Partial<Tag>;
      meta?: TxMeta;
    }
  | {
      kind: "delete";
      model: "tag";
      id: string;
      before: Tag;
      meta?: TxMeta;
    };

export type TransactionKind = Transaction["kind"];
export type TransactionModel = Transaction["model"];

export interface TransactionResult {
  tx: Transaction;
  action: SyncAction;
}

/**
 * Compute the inverse of a transaction so `undo()` can push + re-execute.
 * Every transaction round-trips losslessly when given its full `before`.
 */
export function inverse(tx: Transaction): Transaction {
  switch (tx.kind) {
    case "create":
      if (tx.model === "save") {
        return {
          kind: "delete",
          model: "save",
          id: tx.id,
          before: tx.data as Save,
          meta: tx.meta,
        };
      }
      return {
        kind: "delete",
        model: "tag",
        id: tx.id,
        before: tx.data as Tag,
        meta: tx.meta,
      };
    case "update":
      if (tx.model === "save") {
        return {
          kind: "update",
          model: "save",
          id: tx.id,
          patch: tx.before,
          before: tx.patch as Partial<Save>,
          meta: tx.meta,
        };
      }
      return {
        kind: "update",
        model: "tag",
        id: tx.id,
        patch: tx.before,
        before: tx.patch as Partial<Tag>,
        meta: tx.meta,
      };
    case "delete":
      if (tx.model === "save") {
        return {
          kind: "create",
          model: "save",
          id: tx.id,
          data: tx.before as NewSave,
          meta: tx.meta,
        };
      }
      return {
        kind: "create",
        model: "tag",
        id: tx.id,
        data: tx.before as NewTag,
        meta: tx.meta,
      };
    case "trash":
      return { kind: "untrash", model: "save", id: tx.id, meta: tx.meta };
    case "untrash":
      return { kind: "trash", model: "save", id: tx.id, meta: tx.meta };
    case "purge":
      // Inverse of a hard purge is a re-create from the captured snapshot.
      // The on-disk media is gone; the resurrected row points at empty
      // file paths until a re-capture refills them.
      return {
        kind: "create",
        model: "save",
        id: tx.id,
        data: tx.before as NewSave,
        meta: tx.meta,
      };
    case "archive":
      return { kind: "unarchive", model: "save", id: tx.id, meta: tx.meta };
    case "unarchive":
      return { kind: "archive", model: "save", id: tx.id, meta: tx.meta };
  }
}
