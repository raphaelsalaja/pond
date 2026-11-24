import {
  type ChangelogEntry,
  compareVersions,
  parseChangelogEntry,
} from "@pond/schema/changelog";

const sources = import.meta.glob<string>(
  "../../../../../../../../changelog/*.md",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);

const media = import.meta.glob<string>(
  "../../../../../../../../changelog/media/*",
  {
    query: "?url",
    import: "default",
    eager: true,
  },
);

const MEDIA_URLS = new Map(
  Object.entries(media).map(([path, url]) => [path.split("/").at(-1), url]),
);

/** The bundled URL for an entry's `media` file, or undefined when the file is missing. */
export function mediaUrl(entry: ChangelogEntry): string | undefined {
  return MEDIA_URLS.get(entry.media);
}

function parseAll(files: Record<string, string>): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  for (const [path, source] of Object.entries(files)) {
    try {
      entries.push(parseChangelogEntry(source));
    } catch (error) {
      console.warn(`[pond changelog] skipped ${path}`, error);
    }
  }
  return entries.sort((a, b) => compareVersions(b.version, a.version));
}

/** Every bundled entry, newest first. */
export const CHANGELOG: readonly ChangelogEntry[] = parseAll(sources);

export const CHANGELOG_FILE_COUNT = Object.keys(sources).length;

/** Entries released after `lastSeen` up to `current`. A first run only shows `current`, and only for an existing Library. */
export function unseenVersions({
  entries,
  current,
  lastSeen,
  hasSaves,
}: {
  entries: readonly ChangelogEntry[];
  current: string;
  lastSeen: string | null;
  hasSaves: boolean;
}): string[] {
  if (current.includes("-")) return [];
  if (lastSeen === null) {
    return hasSaves
      ? entries.filter((e) => e.version === current).map((e) => e.version)
      : [];
  }
  return entries
    .filter(
      (e) =>
        compareVersions(e.version, lastSeen) > 0 &&
        compareVersions(e.version, current) <= 0,
    )
    .map((e) => e.version);
}
