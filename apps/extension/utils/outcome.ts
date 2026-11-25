import { CaptureReceiptSchema } from "@pond/schema/capture";
import type { NativeResponse } from "@pond/schema/native";

export type CaptureStatus =
  | "sending"
  | "saved"
  | "duplicate"
  | "failed"
  | "offline";

export type CaptureOutcome =
  | { status: "sending"; id: string }
  | {
      status: "saved" | "duplicate";
      id: string;
      saveId?: string;
      warning?: string;
    }
  | { status: "failed"; id: string; message: string }
  | { status: "offline"; id: string };

const NATIVE_ERRORS = new Map([
  ["unsupported_url", "Pond can't save this page. Try a screenshot instead."],
  [
    "capture_unavailable",
    "This version of Pond can't take saves from the browser. Update Pond.",
  ],
  ["invalid", "Pond couldn't read this save. Update Pond and try again."],
  [
    "host_missing",
    "Pond isn't set up for this browser. Open Pond, then try again.",
  ],
  [
    "host_forbidden",
    "Pond doesn't recognize this copy of the extension. Install it from Pond.",
  ],
  [
    "host_failed",
    "Pond's browser connection stopped. Update or reinstall Pond.",
  ],
  ["incompatible", "This extension needs a newer Pond. Update Pond."],
]);

const GENERIC_ERROR = "Pond couldn't save this. Try again.";

export function outcomeFromResponse(
  id: string,
  response: NativeResponse,
): CaptureOutcome {
  if (!response.ok) {
    if (response.error === "offline") return { status: "offline", id };
    return {
      status: "failed",
      id,
      message: NATIVE_ERRORS.get(response.error) ?? GENERIC_ERROR,
    };
  }
  const receipt = CaptureReceiptSchema.safeParse(response.data);
  if (!receipt.success) return { status: "sending", id };
  const { state, saveIds, duplicateCount, error, warning } = receipt.data;
  if (state === "failed" || state === "cancelled") {
    return { status: "failed", id, message: error ?? GENERIC_ERROR };
  }
  if (state !== "complete") return { status: "sending", id };
  const saveId = saveIds[0];
  const status =
    duplicateCount > 0 && duplicateCount === saveIds.length
      ? "duplicate"
      : "saved";
  const outcome: CaptureOutcome = { status, id };
  if (saveId) outcome.saveId = saveId;
  if (warning) outcome.warning = warning;
  return outcome;
}

export function isSettled(outcome: CaptureOutcome): boolean {
  return outcome.status !== "sending";
}
