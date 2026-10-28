import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  type ChangelogEntry,
  compareVersions,
  parseChangelogEntry,
} from "@pond/schema/changelog";

export type { ChangelogEntry };

/** `next build` runs from `apps/website`; the release notes live at the repo root. */
const CHANGELOG_DIR = path.join(process.cwd(), "../../changelog");

export async function getChangelog(): Promise<ChangelogEntry[]> {
  const files = (await readdir(CHANGELOG_DIR)).filter((file) =>
    file.endsWith(".md"),
  );
  const entries = await Promise.all(
    files.map(async (file) =>
      parseChangelogEntry(
        await readFile(path.join(CHANGELOG_DIR, file), "utf8"),
      ),
    ),
  );
  return entries.sort((a, b) => compareVersions(b.version, a.version));
}

export async function getChangelogEntry(
  version: string,
): Promise<ChangelogEntry | null> {
  const entries = await getChangelog();
  return entries.find((entry) => entry.version === version) ?? null;
}
