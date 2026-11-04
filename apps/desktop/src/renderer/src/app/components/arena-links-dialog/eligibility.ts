export const ARENA_LINKS_NOTICE = "arena-links-web-pages";

type NoticeStep = "skip" | "mark-seen" | "show";

/** A library with nothing to convert has nothing to announce, so it records the notice without showing it. */
export function arenaLinksNoticeStep(input: {
  seen: readonly string[];
  pending: number;
}): NoticeStep {
  if (input.seen.includes(ARENA_LINKS_NOTICE)) return "skip";
  return input.pending > 0 ? "show" : "mark-seen";
}
