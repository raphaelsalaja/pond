export function splitPinned<T extends { id: string }>(
  saves: ReadonlyArray<T>,
  pinnedIds: ReadonlyArray<string>,
) {
  const rank = new Map(pinnedIds.map((id, index) => [id, index]));
  const pinned = saves.filter((save) => rank.has(save.id));
  if (pinned.length === 0) return { pinned, contents: saves };
  pinned.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return {
    pinned,
    contents: saves.filter((save) => !rank.has(save.id)),
  };
}
