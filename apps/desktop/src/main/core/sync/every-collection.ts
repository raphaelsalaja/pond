import type { ImportCollection } from "@pond/schema/db";
import type { CollectionEntry } from "./collection-folders";
import { listGapNote } from "./sync-status";

export interface EveryCollectionPass {
  collections: ImportCollection[];
  entries: CollectionEntry[];
  gap: string | null;
}

export interface EveryCollectionWalk {
  list: () => Promise<
    | { ok: true; collections: readonly ImportCollection[] }
    | { ok: false; reason: string }
  >;
  walk: (
    collections: readonly ImportCollection[],
  ) => Promise<
    { ok: true; entries: CollectionEntry[] } | { ok: false; reason: string }
  >;
}

export const NO_COLLECTION_PASS: EveryCollectionPass = {
  collections: [],
  entries: [],
  gap: null,
};

/** Filing is extra to the import, so a failed pass becomes a gap note instead of failing the sync. */
export async function walkEveryCollection(
  label: string,
  { list, walk }: EveryCollectionWalk,
): Promise<EveryCollectionPass> {
  const listed = await list();
  if (!listed.ok) {
    return { ...NO_COLLECTION_PASS, gap: listGapNote(label, listed.reason) };
  }
  const collections = listed.collections.map(({ id, name }) => ({ id, name }));
  if (collections.length === 0) return NO_COLLECTION_PASS;
  const walked = await walk(collections);
  if (!walked.ok) {
    return { ...NO_COLLECTION_PASS, gap: listGapNote(label, walked.reason) };
  }
  return { collections, entries: walked.entries, gap: null };
}
