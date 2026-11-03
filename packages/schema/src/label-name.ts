/**
 * Casing is preserved for display; dedup happens through `labelKey`.
 * @remarks NFC makes a decomposed accent the same name as its composed letter.
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
