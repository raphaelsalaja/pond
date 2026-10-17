interface CollectionTagged {
  collectionIds?: string[];
}

/** Keeps the first copy of an entry seen in several collections and records every collection it came from. */
export function addCollectionEntry<T extends CollectionTagged>(
  entries: Map<string, T>,
  key: string,
  entry: T,
  collectionId: string,
): void {
  const kept = entries.get(key) ?? entry;
  const ids = kept.collectionIds ?? [];
  entries.set(key, {
    ...kept,
    collectionIds: ids.includes(collectionId) ? ids : [...ids, collectionId],
  });
}
