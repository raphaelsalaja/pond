import type { Source } from "@pond/schema/db";
import { mergeListKinds } from "@pond/schema/list-kinds";
import type { OkFailure, OkSuccess } from "@shared/query-contracts-shared";
import type { SavesImportCounts } from "@shared/saves-contracts-shared";
import type { DataExportImportCounts } from "@shared/saves-import-contracts";
import {
  type Bookmark,
  type BookmarkFile,
  type BookmarkFolder,
  importBookmarkFile,
} from "../bookmarks";
import { addSavesToFolder, importFolderTree } from "../folders";
import { persistSave } from "../persist-save";
import { enqueue } from "../pipeline/enqueue";
import { classifyUrlToSource } from "../pipeline/extractors";
import { listAccounts } from "../sync/accounts";
import { instagramParser } from "./instagram";
import { type ExportReader, openExportReader } from "./reader";
import { redditParser } from "./reddit";
import { tiktokParser } from "./tiktok";
import type { ExportEntry, ExportParser } from "./types";
import { xParser } from "./x";
import { youtubeParser } from "./youtube";

const PARSERS: readonly ExportParser[] = [
  xParser,
  instagramParser,
  tiktokParser,
  youtubeParser,
  redditParser,
];

export type DataExportResult = OkSuccess<DataExportImportCounts> | OkFailure;

export interface DataExportDependencies {
  open: (path: string) => Promise<ExportReader>;
  importFile: (file: BookmarkFile) => Promise<OkSuccess<SavesImportCounts>>;
  connectedSources: () => Promise<ReadonlySet<Source>>;
}

const defaultDependencies: DataExportDependencies = {
  open: openExportReader,
  importFile: (file) =>
    importBookmarkFile(
      file,
      {
        enqueueLink: (url, listKinds) =>
          enqueue(url, { trigger: "user:importDataExport", listKinds }),
        persistImported: async (id, patch) => {
          await persistSave(id, patch, { actorReason: "data-export:import" });
        },
        importFolders: (folders) => importFolderTree(folders, true),
        addToFolder: addSavesToFolder,
      },
      "data-export",
    ),
  connectedSources: async () =>
    new Set((await listAccounts()).map((account) => account.source)),
};

export function entriesToBookmarkFile(
  entries: readonly ExportEntry[],
): BookmarkFile {
  const folders: BookmarkFolder[] = [];
  const folderIds = new Map<string, string>();
  const byUrl = new Map<string, Bookmark>();
  for (const entry of entries) {
    let folderId: string | undefined;
    if (entry.folder) {
      folderId = folderIds.get(entry.folder);
      if (!folderId) {
        folderId = `folder-${folders.length}`;
        folderIds.set(entry.folder, folderId);
        folders.push({
          id: folderId,
          name: entry.folder,
          parentId: null,
          sortOrder: folders.length,
        });
      }
    }
    const existing = byUrl.get(entry.url);
    if (!existing) {
      byUrl.set(entry.url, {
        url: entry.url,
        addedAt: entry.savedAt,
        folderIds: folderId ? [folderId] : [],
        listKinds: [entry.listKind],
      });
      continue;
    }
    if (folderId && !existing.folderIds.includes(folderId))
      existing.folderIds.push(folderId);
    existing.listKinds = mergeListKinds(existing.listKinds, entry.listKind);
    if (
      entry.savedAt &&
      (!existing.addedAt || entry.savedAt < existing.addedAt)
    )
      existing.addedAt = entry.savedAt;
  }
  return { bookmarks: [...byUrl.values()], folders };
}

async function readEntries(
  reader: ExportReader,
): Promise<{ entries: ExportEntry[]; platforms: string[] }> {
  const entries: ExportEntry[] = [];
  const platforms = new Set<string>();
  for (const parser of PARSERS) {
    for (const path of reader.paths.filter(parser.matches)) {
      let text: string;
      try {
        text = await reader.readText(path);
      } catch {
        continue;
      }
      const parsed = parser.parse(path, text);
      if (parsed.length > 0) platforms.add(parser.label);
      entries.push(...parsed);
    }
  }
  return { entries, platforms: [...platforms] };
}

/** Public videos and posts capture without a session, so connecting adds nothing. */
const CAPTURES_SIGNED_OUT = new Set<Source>(["youtube", "reddit"]);

function unconnectedSources(
  file: BookmarkFile,
  connected: ReadonlySet<Source>,
): Source[] {
  const sources = new Set<Source>();
  for (const bookmark of file.bookmarks) {
    const { source } = classifyUrlToSource(bookmark.url);
    if (!source || source === "web" || source === "local") continue;
    if (CAPTURES_SIGNED_OUT.has(source)) continue;
    if (!connected.has(source)) sources.add(source);
  }
  return [...sources];
}

const OPEN_FAILED =
  "Couldn't open that file. Check that the download finished, then try again.";
const UNREADABLE =
  "That isn't a data export Pond can read. Choose the .zip or folder you downloaded from X, Instagram, TikTok, Google Takeout, or Reddit.";

export async function importDataExport(
  path: string,
  dependencies: DataExportDependencies = defaultDependencies,
): Promise<DataExportResult> {
  let reader: ExportReader;
  try {
    reader = await dependencies.open(path);
  } catch {
    return { ok: false, error: OPEN_FAILED };
  }
  try {
    const { entries, platforms } = await readEntries(reader);
    if (entries.length === 0) return { ok: false, error: UNREADABLE };
    const file = entriesToBookmarkFile(entries);
    const counts = await dependencies.importFile(file);
    const connect = unconnectedSources(
      file,
      await dependencies.connectedSources(),
    );
    return { ...counts, platforms, connect };
  } finally {
    await reader.close();
  }
}
