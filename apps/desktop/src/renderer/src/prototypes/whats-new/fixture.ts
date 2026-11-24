import type {
  ChangelogCategory,
  ChangelogEntry,
} from "@pond/schema/changelog";
import { CHANGELOG } from "@/app/components/whats-new-dialog/entries";

export { default as clip } from "./media/pond.mp4";
export { default as poster } from "./media/pond-poster.jpg";

export const RELEASES_URL = "https://github.com/raphaelsalaja/pond/releases";

/** Three unseen releases, as after skipping two updates. Every variant reads these. */
export const RELEASES: readonly ChangelogEntry[] = CHANGELOG.slice(0, 3);

export const LATEST = RELEASES[0] as ChangelogEntry;

/** The version you were on before these three. */
export const LAST_SEEN = CHANGELOG[RELEASES.length]?.version ?? "2.4.0";

export function itemsOf(
  entry: ChangelogEntry,
  category: ChangelogCategory,
): readonly string[] {
  return entry.sections.find((s) => s.category === category)?.items ?? [];
}

export interface Highlight {
  version: string;
  text: string;
}

/** The first two New items of each release. */
export const HIGHLIGHTS: readonly Highlight[] = RELEASES.flatMap((entry) =>
  itemsOf(entry, "new")
    .slice(0, 2)
    .map((text) => ({ version: entry.version, text })),
);

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function countItems(entry: ChangelogEntry): number {
  return entry.sections.reduce((sum, s) => sum + s.items.length, 0);
}

export function openReleases(): void {
  void window.pond.openExternal(RELEASES_URL);
}
