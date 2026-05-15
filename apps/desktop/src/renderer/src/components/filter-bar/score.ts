import type { Predicate } from "@pond/schema/filters/types";
import Fuse, { type IFuseOptions } from "fuse.js";
import type { SearchEntry } from "./registry";

const KIND_PRIORITY: Record<SearchEntry["kind"], number> = {
  group: 4,
  field: 3,
  "field-in-group": 2,
  value: 1,
};

const HEX_PREFIX = /^[0-9a-f]{1,6}$/i;

const FUSE_OPTIONS: IFuseOptions<SearchEntry> = {
  keys: [
    { name: "label", weight: 0.7 },
    { name: "breadcrumb", weight: 0.3 },
  ],
  includeScore: true,
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1,
  shouldSort: false,
};

export function searchEntries(
  entries: readonly SearchEntry[],
  query: string,
  recents: ReadonlyMap<string, number>,
): SearchEntry[] {
  const needle = query.trim();
  if (!needle) {
    return [...entries].sort(
      (a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind],
    );
  }

  const fuse = new Fuse(entries as SearchEntry[], FUSE_OPTIONS);
  const hits = fuse.search(needle);
  if (hits.length === 0) return [];

  const ranked = hits.map(({ item, score }) => ({
    item,
    total: composite(item, score ?? 1, needle, recents),
  }));
  ranked.sort((a, b) => b.total - a.total);
  return ranked.map((r) => r.item);
}

function composite(
  entry: SearchEntry,
  fuseScore: number,
  needle: string,
  recents: ReadonlyMap<string, number>,
): number {
  /* fuse: 0 = perfect, 1 = none. Invert and scale. */
  let total = (1 - fuseScore) * 1000;

  if (entry.kind === "value") {
    const rank = recents.get(predicateKey(entry.predicate));
    if (rank != null) total += Math.max(0, 20 - rank * 2);
    if (
      entry.swatchHex &&
      HEX_PREFIX.test(needle) &&
      entry.swatchHex.toLowerCase().startsWith(needle.toLowerCase())
    ) {
      total += 10;
    }
  }

  total += KIND_PRIORITY[entry.kind];
  return total;
}

export function predicateKey(p: Predicate): string {
  return `${p.field}:${p.cmp}:${JSON.stringify(p.value)}`;
}
