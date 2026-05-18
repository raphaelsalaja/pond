import type { NewSave, NewTag, Save, SyncAction, Tag } from "./db";

export type ActorKind = "user" | "system";

export interface TxMeta {
  actor?: ActorKind;
  actorReason?: string;
  batchId?: string;
  silent?: boolean;
}

export interface TxSaveFile {
  filename: string;
  bytes: Uint8Array;
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
  | {
      kind: "trash";
      model: "save";
      id: string;
      meta?: TxMeta;
    }
  | {
      kind: "untrash";
      model: "save";
      id: string;
      meta?: TxMeta;
    }
  | {
      kind: "purge";
      model: "save";
      id: string;
      before: Save;
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
      return {
        kind: "create",
        model: "save",
        id: tx.id,
        data: tx.before as NewSave,
        meta: tx.meta,
      };
  }
}
