import { SETUP_VERSION } from "../setup/model";

export const SPLIT_CAROUSELS_NOTICE = "split-carousels";

type NoticeStep = "skip" | "wait" | "mark-seen" | "show";

/** Waits out guided setup so a first run counts the library you finish setting up. */
export function splitCarouselsNoticeStep(input: {
  seen: readonly string[];
  setupVersion: number;
  splittable: number;
}): NoticeStep {
  if (input.seen.includes(SPLIT_CAROUSELS_NOTICE)) return "skip";
  if (input.setupVersion < SETUP_VERSION) return "wait";
  return input.splittable > 0 ? "show" : "mark-seen";
}
