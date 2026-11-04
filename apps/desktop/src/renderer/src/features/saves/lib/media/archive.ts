import { z } from "zod";
import { buildPondUrl, pondFileUrl } from "@/features/saves/lib/media/url";
import type { Save, SaveFile } from "@/features/saves/types";

const ARCHIVE_KIND = "archive";
const ARCHIVE_MANIFEST_KIND = "archive_manifest";

type ArchiveScope = "page" | "site";

interface ArchiveManifestPage {
  url: string;
  title: string;
}

export interface ArchiveManifest {
  version: number;
  rootUrl: string;
  archivedAt: string;
  scope: ArchiveScope;
  pages: ArchiveManifestPage[];
}

const ManifestSchema = z.object({
  version: z.number().catch(0),
  rootUrl: z.string().catch(""),
  archivedAt: z.string().catch(""),
  scope: z.literal("page").nullish().catch(null),
  pages: z.array(z.object({ url: z.string(), title: z.string().catch("") })),
});

export function isArchiveFile(file: SaveFile): boolean {
  return file.kind === ARCHIVE_KIND || file.kind === ARCHIVE_MANIFEST_KIND;
}

function archiveManifestFile(save: Save): SaveFile | null {
  return (
    (save.files ?? []).find((f) => f.kind === ARCHIVE_MANIFEST_KIND) ?? null
  );
}

function archiveWarcFile(save: Save): SaveFile | null {
  return (
    (save.files ?? []).find(
      (f) => f.kind === ARCHIVE_KIND && f.path.endsWith(".warc.gz"),
    ) ?? null
  );
}

export function hasArchive(save: Save): boolean {
  return archiveManifestFile(save) !== null && archiveWarcFile(save) !== null;
}

export async function loadArchiveManifest(
  save: Save,
): Promise<ArchiveManifest | null> {
  const file = archiveManifestFile(save);
  if (!file) return null;
  try {
    const res = await fetch(buildPondUrl(save.id, file));
    if (!res.ok) return null;
    const parsed = ManifestSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    return {
      ...parsed.data,
      scope: parsed.data.scope === "page" ? "page" : "site",
    };
  } catch {
    return null;
  }
}

/**
 * wabac.js sniffs the archive format from the source URL's extension, so the URL must stay query-free.
 * The collection id folds in archivedAt: wabac caches indexed collections by id, so a re-archived save must mint a new id or the viewer replays the stale index.
 */
export function buildArchiveViewerUrl(
  save: Save,
  pageUrl: string,
  manifest: ArchiveManifest,
): string | null {
  const warc = archiveWarcFile(save);
  if (!warc) return null;
  const source = pondFileUrl(save.id, warc.path);
  const coll = `${save.id}-${manifest.archivedAt.replace(/[^0-9]/g, "")}`;
  const params = new URLSearchParams({ source, url: pageUrl, coll });
  return `pond://_replay/index.html?${params.toString()}`;
}

export function archiveUrlKey(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return url;
  }
}
