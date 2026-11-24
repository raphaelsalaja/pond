import { z } from "zod";

export const CHANGELOG_CATEGORIES = [
  "important",
  "new",
  "improved",
  "fixed",
] as const;

export type ChangelogCategory = (typeof CHANGELOG_CATEGORIES)[number];

function categoryForHeading(heading: string): ChangelogCategory | undefined {
  return CHANGELOG_CATEGORIES.find(
    (category) =>
      category.charAt(0).toUpperCase() + category.slice(1) === heading,
  );
}

const VIDEO = /\.(mp4|webm)$/;

/** True when an entry's media file plays as a video rather than showing as an image. */
export function isVideoMedia(media: string): boolean {
  return VIDEO.test(media);
}

const SectionSchema = z.strictObject({
  category: z.enum(CHANGELOG_CATEGORIES),
  items: z.array(z.string().min(1)).min(1),
});

export const ChangelogEntrySchema = z
  .strictObject({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    date: z.iso.date(),
    title: z.string().min(1),
    summary: z.string().min(1),
    media: z
      .string()
      .regex(
        /^[\w.-]+\.(png|jpe?g|webp|gif|mp4|webm)$/,
        "Media must be a file name in changelog/media/, an image or an mp4 or webm video.",
      ),
    sections: z.array(SectionSchema).min(1),
  })
  .refine(
    (entry) => {
      const ranks = entry.sections.map((section) =>
        CHANGELOG_CATEGORIES.indexOf(section.category),
      );
      return ranks.every(
        (rank, index) => index === 0 || rank > (ranks[index - 1] ?? -1),
      );
    },
    {
      message:
        "Sections must appear at most once, in the order Important, New, Improved, Fixed.",
    },
  );

export type ChangelogEntry = z.infer<typeof ChangelogEntrySchema>;
export type ChangelogSection = ChangelogEntry["sections"][number];

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/** Parses one `changelog/<version>.md` file. Throws when the file breaks the format. */
export function parseChangelogEntry(source: string): ChangelogEntry {
  const match = FRONTMATTER.exec(source.replaceAll("\r\n", "\n"));
  if (!match) {
    throw new Error("Changelog entry needs a --- frontmatter block.");
  }
  const [, head = "", body = ""] = match;

  const fields: Record<string, string> = {};
  for (const line of head.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 1) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }

  const sections: Array<{ category: ChangelogCategory; items: Array<string> }> =
    [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith("## ")) {
      const category = categoryForHeading(line.slice(3).trim());
      if (!category) {
        throw new Error(`Unknown changelog section: ${line}`);
      }
      sections.push({ category, items: [] });
      continue;
    }
    const section = sections.at(-1);
    if (!line.startsWith("- ") || !section) {
      throw new Error(`Expected a "## Section" or "- item" line: ${line}`);
    }
    section.items.push(line.slice(2).trim());
  }

  return ChangelogEntrySchema.parse({ ...fields, sections });
}

function versionParts(version: string): Array<number> {
  return (version.split("-")[0] ?? "").split(".").map(Number);
}

/** Orders `x.y.z` versions; a prerelease sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let index = 0; index < 3; index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return Number(b.includes("-")) - Number(a.includes("-"));
}
