export function normalizeLabelName(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-/:.]/gi, "")
    .toLowerCase();
}
