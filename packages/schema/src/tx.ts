import type {
  NewFolder,
  NewSave,
  NewSavedView,
  NewTag,
  NewTagGroup,
  NewTagGroupMember,
  SyncAction,
} from "./db";

export type ActorKind = "user" | "system" | "agent";

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
      kind: "update";
      model: "save_folder";
      id: string;
      patch: { folderIds: string[] };
      before: { folderIds: string[] };
      meta?: TxMeta;
    }
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
      before: Partial<NewSave>;
      titleLock?: { before: boolean; after: boolean };
      fileRenames?: Array<{ from: string; to: string }>;
      files?: TxSaveFile[];
      /** Main-process temp files moved into the Save so large media is never buffered; renderers can't send these. */
      fileMoves?: Array<{ sourcePath: string; filename: string }>;
      beforeFiles?: TxSaveFile[];
      meta?: TxMeta;
    }
  | {
      kind: "delete";
      model: "save";
      id: string;
      before: NewSave;
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
      before: NewSave;
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
      before: Partial<NewTag>;
      meta?: TxMeta;
    }
  | {
      kind: "delete";
      model: "tag";
      id: string;
      before: NewTag;
      meta?: TxMeta;
    }
  | {
      kind: "create";
      model: "tag_group";
      id: string;
      data: NewTagGroup;
      meta?: TxMeta;
    }
  | {
      kind: "update";
      model: "tag_group";
      id: string;
      patch: Partial<NewTagGroup>;
      before: Partial<NewTagGroup>;
      meta?: TxMeta;
    }
  | {
      kind: "delete";
      model: "tag_group";
      id: string;
      before: NewTagGroup;
      meta?: TxMeta;
    }
  | {
      kind: "create";
      model: "tag_group_member";
      id: string;
      data: NewTagGroupMember;
      meta?: TxMeta;
    }
  | {
      kind: "delete";
      model: "tag_group_member";
      id: string;
      before: NewTagGroupMember;
      meta?: TxMeta;
    }
  | {
      kind: "create";
      model: "saved_view";
      id: string;
      data: NewSavedView;
      meta?: TxMeta;
    }
  | {
      kind: "update";
      model: "saved_view";
      id: string;
      patch: Partial<NewSavedView>;
      before: Partial<NewSavedView>;
      meta?: TxMeta;
    }
  | {
      kind: "delete";
      model: "saved_view";
      id: string;
      before: NewSavedView;
      meta?: TxMeta;
    }
  | {
      kind: "create";
      model: "folder";
      id: string;
      data: NewFolder;
      meta?: TxMeta;
    }
  | {
      kind: "update";
      model: "folder";
      id: string;
      patch: Partial<NewFolder>;
      before: Partial<NewFolder>;
      meta?: TxMeta;
    }
  | {
      kind: "delete";
      model: "folder";
      id: string;
      before: NewFolder;
      meta?: TxMeta;
    };

export type SyncActionPayload =
  | Extract<Transaction, { data: unknown }>["data"]
  | Extract<Transaction, { patch: unknown }>["patch"]
  | { deletedAt: Date | null }
  | null;

export type TransactionKind = Transaction["kind"];
export type TransactionModel = Transaction["model"];

export interface TransactionResult {
  tx: Transaction;
  action: SyncAction;
}

export function inverse(tx: Transaction): Transaction {
  switch (tx.kind) {
    case "create":
      switch (tx.model) {
        case "save":
          return {
            kind: "delete",
            model: "save",
            id: tx.id,
            before: tx.data,
            meta: tx.meta,
          };
        case "tag":
          return {
            kind: "delete",
            model: "tag",
            id: tx.id,
            before: tx.data,
            meta: tx.meta,
          };
        case "tag_group":
          return {
            kind: "delete",
            model: "tag_group",
            id: tx.id,
            before: tx.data,
            meta: tx.meta,
          };
        case "tag_group_member":
          return {
            kind: "delete",
            model: "tag_group_member",
            id: tx.id,
            before: tx.data,
            meta: tx.meta,
          };
        case "saved_view":
          return {
            kind: "delete",
            model: "saved_view",
            id: tx.id,
            before: tx.data,
            meta: tx.meta,
          };
        case "folder":
          return {
            kind: "delete",
            model: "folder",
            id: tx.id,
            before: tx.data,
            meta: tx.meta,
          };
      }
      break;
    case "update":
      switch (tx.model) {
        case "save_folder":
          return {
            kind: "update",
            model: "save_folder",
            id: tx.id,
            patch: tx.before,
            before: tx.patch,
            meta: tx.meta,
          };
        case "save": {
          const inverse: Extract<
            Transaction,
            { kind: "update"; model: "save" }
          > = {
            kind: "update",
            model: "save",
            id: tx.id,
            patch: tx.before,
            before: tx.patch,
            meta: tx.meta,
          };
          if (tx.titleLock)
            inverse.titleLock = {
              before: tx.titleLock.after,
              after: tx.titleLock.before,
            };
          if (tx.beforeFiles) inverse.files = tx.beforeFiles;
          if (tx.files) inverse.beforeFiles = tx.files;
          if (tx.fileRenames)
            inverse.fileRenames = tx.fileRenames.map(({ from, to }) => ({
              from: to,
              to: from,
            }));
          return inverse;
        }
        case "tag":
          return {
            kind: "update",
            model: "tag",
            id: tx.id,
            patch: tx.before,
            before: tx.patch,
            meta: tx.meta,
          };
        case "tag_group":
          return {
            kind: "update",
            model: "tag_group",
            id: tx.id,
            patch: tx.before,
            before: tx.patch,
            meta: tx.meta,
          };
        case "saved_view":
          return {
            kind: "update",
            model: "saved_view",
            id: tx.id,
            patch: tx.before,
            before: tx.patch,
            meta: tx.meta,
          };
        case "folder":
          return {
            kind: "update",
            model: "folder",
            id: tx.id,
            patch: tx.before,
            before: tx.patch,
            meta: tx.meta,
          };
      }
      break;
    case "delete":
      switch (tx.model) {
        case "save":
          return {
            kind: "create",
            model: "save",
            id: tx.id,
            data: tx.before,
            meta: tx.meta,
          };
        case "tag":
          return {
            kind: "create",
            model: "tag",
            id: tx.id,
            data: tx.before,
            meta: tx.meta,
          };
        case "tag_group":
          return {
            kind: "create",
            model: "tag_group",
            id: tx.id,
            data: tx.before,
            meta: tx.meta,
          };
        case "tag_group_member":
          return {
            kind: "create",
            model: "tag_group_member",
            id: tx.id,
            data: tx.before,
            meta: tx.meta,
          };
        case "saved_view":
          return {
            kind: "create",
            model: "saved_view",
            id: tx.id,
            data: tx.before,
            meta: tx.meta,
          };
        case "folder":
          return {
            kind: "create",
            model: "folder",
            id: tx.id,
            data: tx.before,
            meta: tx.meta,
          };
      }
      break;
    case "trash":
      return { kind: "untrash", model: "save", id: tx.id, meta: tx.meta };
    case "untrash":
      return { kind: "trash", model: "save", id: tx.id, meta: tx.meta };
    case "purge":
      return {
        kind: "create",
        model: "save",
        id: tx.id,
        data: tx.before,
        meta: tx.meta,
      };
  }
  throw new Error("tx.inverse: unhandled transaction shape");
}
