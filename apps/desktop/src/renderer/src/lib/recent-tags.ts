import { normalizeLabelName } from "@pond/schema/label-name";

const KEY = "pond.tags.recent";
const CAP = 12;

export function getRecentTags(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .slice(0, CAP);
  } catch {
    return [];
  }
}

export function pushRecentTag(name: string): void {
  const cleaned = normalizeLabelName(name);
  if (!cleaned) return;
  try {
    const current = getRecentTags();
    const lowered = cleaned.toLowerCase();
    const next = [
      cleaned,
      ...current.filter((t) => t.toLowerCase() !== lowered),
    ].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* localStorage may be unavailable; recent list is best-effort */
  }
}
