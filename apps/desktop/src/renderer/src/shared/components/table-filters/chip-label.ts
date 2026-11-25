export interface FilterOption<T extends string = string> {
  id: T;
  label: string;
}

export function filterChipLabel(
  name: string,
  selected: ReadonlyArray<string>,
): string {
  if (selected.length === 0) return name;
  if (selected.length <= 2) return `${name}: ${selected.join(", ")}`;
  return `${name}: ${selected.length}`;
}

export function filterChipSummary(
  name: string,
  selected: ReadonlyArray<string>,
): string {
  if (selected.length === 0) return name;
  if (selected.length <= 2) return selected.join(", ");
  return String(selected.length);
}

export function uniqueFilterOptions<T extends string>(
  items: ReadonlyArray<FilterOption<T>>,
): Array<FilterOption<T>> {
  const seen = new Set<T>();
  const next: Array<FilterOption<T>> = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  next.sort((left, right) => left.label.localeCompare(right.label));
  return next;
}
