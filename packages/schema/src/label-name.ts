/**
 * Casing is preserved for display; dedup happens through `labelKey`.
 * Letters and combining marks from any script stay. NFC makes a decomposed
 * accent the same name as its composed letter. A leading `#` is removed,
 * whitespace collapses, and characters other than digits, space, `/`, `:`,
 * `.`, and `-` are still removed.
 */
export function normalizeLabelName(raw: string): string {
  return raw
    .normalize("NFC")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{M}0-9 /:.-]/gu, "")
    .trim();
}

export function labelKey(raw: string): string {
  return normalizeLabelName(raw).toLowerCase();
}
