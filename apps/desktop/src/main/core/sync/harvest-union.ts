import type { ListKind } from "@pond/schema/db";
import { mergeListKinds } from "@pond/schema/list-kinds";

export function unionById<T>(
  primary: Array<T>,
  extra: Array<T>,
  id: (entry: T) => string,
  merge?: (kept: T, incoming: T) => T,
): Array<T> {
  const out = [...primary];
  const indexById = new Map<string, number>();
  for (const [i, entry] of out.entries()) {
    const key = id(entry);
    if (!indexById.has(key)) {
      indexById.set(key, i);
    }
  }
  for (const entry of extra) {
    const key = id(entry);
    const idx = indexById.get(key);
    if (idx === undefined) {
      indexById.set(key, out.length);
      out.push(entry);
      continue;
    }
    const kept = out[idx];
    if (merge && kept) {
      out[idx] = merge(kept, entry);
    }
  }
  return out;
}

interface ListKindsEntry {
  listKinds?: Array<ListKind>;
}

/** The `& object` keeps an entry literal without `listKinds` from tripping excess-property checks. */
export function stampListKind<T extends ListKindsEntry & object>(
  entries: Array<T>,
  kind: ListKind,
): Array<T & { listKinds: Array<ListKind> }> {
  return entries.map((entry) => ({
    ...entry,
    listKinds: mergeListKinds(entry.listKinds, kind),
  }));
}

/** A walk of one list can still say which list it read, such as Likes, so only unlabeled entries take the default. */
export function defaultListKind<T extends ListKindsEntry & object>(
  entries: Array<T>,
  kind: ListKind,
): Array<T & { listKinds: Array<ListKind> }> {
  return entries.map((entry) => ({
    ...entry,
    listKinds: entry.listKinds?.length ? entry.listKinds : [kind],
  }));
}

export function mergeEntryListKinds<T extends ListKindsEntry>(
  kept: T,
  incoming: T,
): T {
  return {
    ...kept,
    listKinds: mergeListKinds(kept.listKinds, incoming.listKinds),
  };
}
