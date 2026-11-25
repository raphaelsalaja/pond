import { FILE_RING_CAPACITY, fileRingItemKey } from "@pond/schema/file-ring";
import type { FileRingItem } from "@pond/schema/file-ring";

export function moveRingItem(
  items: ReadonlyArray<FileRingItem>,
  from: number,
  to: number,
): Array<FileRingItem> {
  const next = [...items];
  if (to < 0 || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

export function removeRingItem(
  items: ReadonlyArray<FileRingItem>,
  index: number,
): Array<FileRingItem> {
  return items.filter((_, position) => position !== index);
}

export function canAddRingItem(
  items: ReadonlyArray<FileRingItem>,
  item: FileRingItem,
): boolean {
  const key = fileRingItemKey(item);
  return (
    items.length < FILE_RING_CAPACITY &&
    !items.some((entry) => fileRingItemKey(entry) === key)
  );
}

export function addRingItem(
  items: ReadonlyArray<FileRingItem>,
  item: FileRingItem,
): Array<FileRingItem> {
  return canAddRingItem(items, item) ? [...items, item] : [...items];
}
