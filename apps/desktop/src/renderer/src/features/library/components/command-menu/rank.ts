import { MIN_SCORE, matchItem } from "./score";
import type { MenuEntry, MenuModel, MenuRow, RankedEntry } from "./types";

export function rankEntries(
  entries: readonly MenuEntry[],
  query: string,
): RankedEntry[] {
  const trimmed = query.trim();
  if (!trimmed)
    return entries.map((entry) => ({ entry, score: 1, ranges: [] }));
  const ranked: RankedEntry[] = [];
  for (const entry of entries) {
    const match = matchItem(entry, trimmed);
    const weight = entry.scoreWeight ?? 1;
    const matched =
      !match || weight === 0 ? 0 : match.score === 1 ? 1 : match.score * weight;
    const score = Math.max(matched, entry.scoreFloor ?? 0);
    if (score < MIN_SCORE) continue;
    ranked.push({ entry, score, ranges: match?.ranges ?? [] });
  }
  return ranked;
}

interface ModelInput {
  ranked: readonly RankedEntry[];
  /** Orders groups and entries by score; otherwise they keep input order. */
  byScore: boolean;
  limits?: Readonly<Record<string, number>>;
  status?: { label: string; busy: boolean } | null;
  footer?: RankedEntry | null;
}

/** Groups ranked entries into labelled rows, best group first, with each row's selectable index. */
export function buildModel({
  ranked,
  byScore,
  limits = {},
  status = null,
  footer = null,
}: ModelInput): MenuModel {
  const groups = new Map<string, RankedEntry[]>();
  for (const item of ranked) {
    const list = groups.get(item.entry.group);
    if (list) list.push(item);
    else groups.set(item.entry.group, [item]);
  }
  const ordered = [...groups];
  if (byScore) {
    for (const [, items] of ordered) items.sort((a, b) => b.score - a.score);
    ordered.sort(([, a], [, b]) => (b[0]?.score ?? 0) - (a[0]?.score ?? 0));
  }

  const rows: MenuRow[] = [];
  const entries: RankedEntry[] = [];
  for (const [label, items] of ordered) {
    if (label)
      rows.push({
        kind: "group",
        key: `group:${label}`,
        label,
        divided: rows.length > 0,
      });
    for (const item of items.slice(0, limits[label] ?? items.length)) {
      rows.push({
        kind: "entry",
        key: item.entry.id,
        index: entries.length,
        item,
      });
      entries.push(item);
    }
  }
  if (status) rows.push({ kind: "status", key: "status", ...status });
  if (footer) entries.push(footer);
  return { rows, entries, footer };
}
