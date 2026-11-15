import type { RenameOptions } from "./rename-template";

export type EmptyInput = Record<string, never>;

type NoData = Record<never, never>;

export type OkSuccess<Data = NoData> = { ok: true } & Data;

export interface OkFailure {
  ok: false;
  error: string;
  reason?: never;
}

export type OkResult<Data = NoData> = OkSuccess<Data> | OkFailure;

/** Names the Undo history step a mutation recorded, or null when it changed nothing or skipped history. */
export interface UndoableChange {
  undoId: string | null;
}

export interface ReasonFailure<Reason extends string> {
  ok: false;
  reason: Reason;
  error?: never;
}

export type ReasonResult<Reason extends string, Data = NoData> =
  | OkSuccess<Data>
  | ReasonFailure<Reason>;

/**
 * Why Safari would not open Pond's extension settings. `unsigned-build` is the common one
 * for a locally built copy: Safari builds its list from the code signature and skips
 * ad-hoc appexes unless "Allow unsigned extensions" is on.
 */
export type SafariSettingsFailureReason =
  | "unsupported"
  | "not-bundled"
  | "helper-missing"
  | "unsigned-build"
  | "safari-refused";

export type OpenSafariResult =
  | { ok: true }
  | { ok: false; reason: SafariSettingsFailureReason; error: string };

export type CancellableResult<Data = NoData> =
  | OkResult<Data>
  | ReasonFailure<"cancelled">;

export type BatchRenameInput = RenameOptions & {
  ids: string[];
  pattern: string;
};
