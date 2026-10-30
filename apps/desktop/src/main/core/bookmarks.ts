import type { NewSave } from "@pond/schema/db";
import type { ImportOrigin } from "@pond/schema/import-origin";
import type { ListKind } from "@pond/schema/list-kinds";
import type { OkSuccess } from "@shared/query-contracts-shared";
import type { SavesImportCounts } from "@shared/saves-contracts-shared";
import { z } from "zod";
import { addSavesToFolder, importFolderTree } from "./folders";
import { persistSave } from "./persist-save";
import { type EnqueueOneResult, enqueue } from "./pipeline/enqueue";

export interface BookmarkFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface Bookmark {
  url: string;
  addedAt: Date | null;
  folderIds: string[];
  listKinds?: ListKind[];
}

export interface BookmarkFile {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
}

const TOKEN_RE =
  /<h3\b([^>]*)>([\s\S]*?)<\/h3>|<a\b([^>]*)>|<dl\b[^>]*>|<\/dl>/gi;
const HREF_RE = /\bhref\s*=\s*["']([^"']+)["']/i;
const ADD_DATE_RE = /\badd_date\s*=\s*["']?(\d+)/i;
/** Browser exports mark their toolbar and unsorted roots; those hold bookmarks, not user folders. */
const ROOT_FOLDER_RE =
  /\b(?:personal_toolbar_folder|unfiled_bookmarks_folder)\s*=\s*["']?true/i;
const ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);
/** Chromium stores times as microseconds since 1601-01-01 UTC. */
const WEBKIT_EPOCH_OFFSET_MS = 11_644_473_600_000;

interface ChromiumNode {
  type?: string;
  name?: string;
  url?: string;
  date_added?: string;
  children?: ChromiumNode[];
}

const ChromiumNodeSchema: z.ZodType<ChromiumNode> = z.lazy(() =>
  z.object({
    type: z.string().optional().catch(undefined),
    name: z.string().optional().catch(undefined),
    url: z.string().optional().catch(undefined),
    date_added: z.string().optional().catch(undefined),
    children: z.array(ChromiumNodeSchema.catch({})).optional().catch(undefined),
  }),
);

const ChromiumBookmarksSchema = z.object({
  roots: z.object({
    bookmark_bar: ChromiumNodeSchema.optional().catch(undefined),
    other: ChromiumNodeSchema.optional().catch(undefined),
    synced: ChromiumNodeSchema.optional().catch(undefined),
  }),
});

function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const code = entity.startsWith("#x")
      ? Number.parseInt(entity.slice(2), 16)
      : entity.startsWith("#")
        ? Number.parseInt(entity.slice(1), 10)
        : null;
    if (code !== null)
      return Number.isFinite(code) && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    return ENTITIES.get(entity.toLowerCase()) ?? match;
  });
}

function webUrl(raw: string): string | null {
  try {
    const url = new URL(decodeEntities(raw.trim()));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Exporters disagree on units: Netscape uses seconds, some tools write milliseconds or microseconds. */
function epochDate(value: number): Date | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const ms = value < 1e11 ? value * 1000 : value < 1e14 ? value : value / 1000;
  return new Date(ms);
}

class BookmarkCollector {
  readonly folders: BookmarkFolder[] = [];
  private readonly byUrl = new Map<string, Bookmark>();
  private readonly childCounts = new Map<string | null, number>();

  addFolder(name: string, parentId: string | null): string {
    const id = `folder-${this.folders.length}`;
    const sortOrder = this.childCounts.get(parentId) ?? 0;
    this.childCounts.set(parentId, sortOrder + 1);
    this.folders.push({
      id,
      name: name.trim() || "Untitled",
      parentId,
      sortOrder,
    });
    return id;
  }

  addBookmark(url: string, addedAt: Date | null, folderId: string | null) {
    const existing = this.byUrl.get(url);
    if (!existing) {
      this.byUrl.set(url, {
        url,
        addedAt,
        folderIds: folderId ? [folderId] : [],
      });
      return;
    }
    if (folderId && !existing.folderIds.includes(folderId))
      existing.folderIds.push(folderId);
    if (addedAt && (!existing.addedAt || addedAt < existing.addedAt))
      existing.addedAt = addedAt;
  }

  result(): BookmarkFile {
    return { bookmarks: [...this.byUrl.values()], folders: this.folders };
  }
}

export function parseNetscapeBookmarks(html: string): BookmarkFile {
  const collector = new BookmarkCollector();
  const stack: Array<string | null> = [];
  let pending: string | null | undefined;
  for (const match of html.matchAll(TOKEN_RE)) {
    const [token, folderAttrs, folderName, linkAttrs] = match;
    const parentId = stack.at(-1) ?? null;
    if (folderAttrs !== undefined) {
      pending = ROOT_FOLDER_RE.test(folderAttrs)
        ? parentId
        : collector.addFolder(
            decodeEntities(folderName?.replace(/<[^>]*>/g, "") ?? ""),
            parentId,
          );
    } else if (linkAttrs !== undefined) {
      const href = HREF_RE.exec(linkAttrs)?.[1];
      const url = href ? webUrl(href) : null;
      if (!url) continue;
      const added = ADD_DATE_RE.exec(linkAttrs)?.[1];
      collector.addBookmark(
        url,
        added ? epochDate(Number(added)) : null,
        parentId,
      );
    } else if (token.startsWith("</")) {
      stack.pop();
    } else {
      stack.push(pending === undefined ? parentId : pending);
      pending = undefined;
    }
  }
  return collector.result();
}

function chromiumDate(value: string | undefined): Date | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const ms = Number(BigInt(value) / 1000n) - WEBKIT_EPOCH_OFFSET_MS;
  return ms > 0 ? new Date(ms) : null;
}

export function parseChromiumBookmarks(text: string): BookmarkFile | null {
  let parsed: z.infer<typeof ChromiumBookmarksSchema>;
  try {
    const result = ChromiumBookmarksSchema.safeParse(JSON.parse(text));
    if (!result.success) return null;
    parsed = result.data;
  } catch {
    return null;
  }
  const collector = new BookmarkCollector();
  const walk = (children: ChromiumNode[] = [], folderId: string | null) => {
    for (const child of children) {
      if (child.type === "url" && child.url) {
        const url = webUrl(child.url);
        if (url)
          collector.addBookmark(url, chromiumDate(child.date_added), folderId);
      } else if (child.type === "folder") {
        walk(child.children, collector.addFolder(child.name ?? "", folderId));
      }
    }
  };
  const { bookmark_bar, other, synced } = parsed.roots;
  for (const root of [bookmark_bar, other, synced]) walk(root?.children, null);
  return collector.result();
}

export function parseBookmarkFile(text: string): BookmarkFile | null {
  return text.trimStart().startsWith("{")
    ? parseChromiumBookmarks(text)
    : parseNetscapeBookmarks(text);
}

export interface BookmarkImportDependencies {
  enqueueLink: (
    url: string,
    listKinds: ListKind[] | undefined,
  ) => Promise<EnqueueOneResult>;
  persistImported: (id: string, patch: Partial<NewSave>) => Promise<void>;
  importFolders: (folders: BookmarkFolder[]) => Promise<Map<string, string>>;
  addToFolder: (folderId: string, saveIds: string[]) => Promise<OkSuccess>;
}

const defaultDependencies: BookmarkImportDependencies = {
  enqueueLink: (url, listKinds) =>
    enqueue(url, { trigger: "user:importBookmarks", listKinds }),
  persistImported: async (id, patch) => {
    await persistSave(id, patch, { actorReason: "bookmarks:import" });
  },
  importFolders: (folders) => importFolderTree(folders, true),
  addToFolder: addSavesToFolder,
};

/** Origin, dates and folders apply only to Saves this import creates, so existing Saves keep their own. */
export async function importBookmarkFile(
  file: BookmarkFile,
  dependencies: BookmarkImportDependencies = defaultDependencies,
  origin: ImportOrigin = "bookmarks",
): Promise<OkSuccess<SavesImportCounts>> {
  let imported = 0;
  let skipped = 0;
  const created: Array<{ id: string; bookmark: Bookmark }> = [];
  for (const bookmark of file.bookmarks) {
    let result: EnqueueOneResult;
    try {
      result = await dependencies.enqueueLink(bookmark.url, bookmark.listKinds);
    } catch {
      skipped += 1;
      continue;
    }
    if (!result.created) {
      skipped += 1;
      continue;
    }
    imported += 1;
    created.push({ id: result.id, bookmark });
    await dependencies.persistImported(result.id, {
      importedFrom: origin,
      ...(bookmark.addedAt && {
        savedAt: bookmark.addedAt,
        createdAt: bookmark.addedAt,
      }),
    });
  }
  const used = new Set(created.flatMap(({ bookmark }) => bookmark.folderIds));
  if (used.size > 0) {
    const needed = new Set<string>();
    const byId = new Map(file.folders.map((folder) => [folder.id, folder]));
    for (const id of used) {
      for (
        let at = byId.get(id);
        at;
        at = at.parentId ? byId.get(at.parentId) : undefined
      )
        needed.add(at.id);
    }
    const mapped = await dependencies.importFolders(
      file.folders.filter((folder) => needed.has(folder.id)),
    );
    const members = new Map<string, string[]>();
    for (const { id, bookmark } of created) {
      for (const folderId of bookmark.folderIds) {
        const pondId = mapped.get(folderId);
        if (!pondId) continue;
        members.set(pondId, [...(members.get(pondId) ?? []), id]);
      }
    }
    for (const [folderId, saveIds] of members)
      await dependencies.addToFolder(folderId, saveIds);
  }
  return { ok: true, imported, skipped };
}
