import {
  FILE_RING_CAPACITY,
  type FileRingItem,
  fileRingItemKey,
} from "@pond/schema/file-ring";

export function moveRingItem(
  items: readonly FileRingItem[],
  from: number,
  to: number,
): FileRingItem[] {
  const next = [...items];
  if (to < 0 || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

export function removeRingItem(
  items: readonly FileRingItem[],
  index: number,
): FileRingItem[] {
  return items.filter((_, position) => position !== index);
}

export function canAddRingItem(
  items: readonly FileRingItem[],
  item: FileRingItem,
): boolean {
  const key = fileRingItemKey(item);
  return (
    items.length < FILE_RING_CAPACITY &&
    !items.some((entry) => fileRingItemKey(entry) === key)
  );
}

export function addRingItem(
  items: readonly FileRingItem[],
  item: FileRingItem,
): FileRingItem[] {
  return canAddRingItem(items, item) ? [...items, item] : [...items];
}
