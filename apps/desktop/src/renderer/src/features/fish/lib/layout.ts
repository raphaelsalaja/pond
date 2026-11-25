import type { Fish, FishPlacement, FishSection } from "@shared/fish-contracts";

export const PINNED = "pinned";
export const LOOSE = "loose";

/** Fish ids per shelf: the pinned grid, the loose list, then one per section id. */
export type FishLayout = Record<string, Array<string>>;

export function shelfKeys(sections: ReadonlyArray<FishSection>): Array<string> {
  return [PINNED, LOOSE, ...sections.map((section) => section.id)];
}

export function fishLayout(
  school: ReadonlyArray<Pick<Fish, "id" | "pinned" | "section">>,
  sections: ReadonlyArray<FishSection>,
): FishLayout {
  const layout: FishLayout = Object.fromEntries(
    shelfKeys(sections).map((key) => [key, []]),
  );
  for (const fish of school) {
    const key = fish.pinned
      ? PINNED
      : fish.section && layout[fish.section]
        ? fish.section
        : LOOSE;
    layout[key]?.push(fish.id);
  }
  return layout;
}

export function shelfOf(layout: FishLayout, id: string): string | null {
  if (layout[id]) return id;
  return Object.keys(layout).find((key) => layout[key]?.includes(id)) ?? null;
}

export function moveFish(
  layout: FishLayout,
  id: string,
  to: string,
  index = layout[to]?.length ?? 0,
): FishLayout {
  const next: FishLayout = Object.fromEntries(
    Object.entries(layout).map(([key, ids]) => [
      key,
      ids.filter((entry) => entry !== id),
    ]),
  );
  const target = next[to] ?? [];
  next[to] = [...target.slice(0, index), id, ...target.slice(index)];
  return next;
}

export function layoutPlacements(
  layout: FishLayout,
  sections: ReadonlyArray<FishSection>,
): Array<FishPlacement> {
  return shelfKeys(sections).flatMap((key) =>
    (layout[key] ?? []).map((id) => ({
      id,
      pinned: key === PINNED,
      section: key === PINNED || key === LOOSE ? null : key,
    })),
  );
}

export function sameLayout(a: FishLayout, b: FishLayout): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key]?.join() === b[key]?.join())
  );
}
