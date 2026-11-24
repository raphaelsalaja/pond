import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  folders,
  savedViews,
  saveFolders,
  saves,
  tagGroupMembers,
  tagGroups,
  tags as tagsTable,
} from "@pond/schema/db";
import { isGroup } from "@pond/schema/filters/types";
import type { Query } from "@pond/schema/filters/types";
import { inArray } from "drizzle-orm";
import { getDb } from "../db";
import { saveDir } from "../paths";
import { exportEaglePackage } from "./eagle-package";
import { exportFiles, safeName, sharedFolderPath } from "./export-files";
import type { ExportFolder, ExportItem } from "./export-files";
import { zipDirectory } from "./export-zip";
import { runLibraryTransfer } from "./library-transfers";
import { getPrefs } from "./prefs";

function folderReferences(query: Query): Set<string> {
  const result = new Set<string>();
  for (const rule of query.rules) {
    if (isGroup(rule)) {
      for (const id of folderReferences(rule)) {
        result.add(id);
      }
    } else if (
      rule.field === "folder" &&
      rule.operator !== "empty" &&
      Array.isArray(rule.value)
    ) {
      for (const id of rule.value) {
        result.add(String(id));
      }
    }
  }
  return result;
}

export function selectionViews(
  views: ReadonlyArray<typeof savedViews.$inferSelect>,
  folderIds: ReadonlySet<string>,
) {
  const byId = new Map(views.map((view) => [view.id, view]));
  const included = new Set(
    views.flatMap((view) =>
      view.kind !== "group" &&
      [...folderReferences(view.query)].every((id) => folderIds.has(id))
        ? [view.id]
        : [],
    ),
  );
  for (const id of included) {
    let parent = byId.get(id)?.parentId ?? null;
    const visited = new Set([id]);
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      included.add(parent);
      parent = byId.get(parent)?.parentId ?? null;
    }
  }
  return views.flatMap((view) =>
    included.has(view.id)
      ? [
          {
            id: view.id,
            name: view.name,
            kind: view.kind,
            parent_id: view.parentId,
            question: view.question,
            query: JSON.stringify(view.query),
            sort_key: view.sortKey,
            sort_dir: view.sortDir,
            layout: view.layout,
            sort_order: view.sortOrder,
            created_at: view.createdAt.getTime(),
          },
        ]
      : [],
  );
}

async function exportSelection(
  ids: ReadonlyArray<string>,
  options: { includeDerived?: boolean } = {},
) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    throw new Error("Select Saves to export.");
  }
  const db = await getDb();
  const rows = await db.select().from(saves).where(inArray(saves.id, unique));
  if (rows.length !== unique.length) {
    throw new Error("One of the selected Saves no longer exists.");
  }
  const memberships = await db
    .select()
    .from(saveFolders)
    .where(inArray(saveFolders.saveId, unique));
  const allFolders = await db.select().from(folders);
  const included = new Set(
    memberships.map((membership) => membership.folderId),
  );
  const byId = new Map(allFolders.map((folder) => [folder.id, folder]));
  for (const id of included) {
    let parent = byId.get(id)?.parentId;
    const visited = new Set<string>([id]);
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      included.add(parent);
      parent = byId.get(parent)?.parentId;
    }
  }
  const selectedTags = new Set(
    rows.flatMap((save) => save.tags ?? []).map((name) => name.toLowerCase()),
  );
  const [registry, views, groups, members] = options.includeDerived
    ? await Promise.all([
        db.select().from(tagsTable),
        db.select().from(savedViews),
        db.select().from(tagGroups),
        db.select().from(tagGroupMembers),
      ])
    : [[], [], [], []];
  const selectedRegistry = registry.filter((tag) =>
    selectedTags.has(tag.name.toLowerCase()),
  );
  const selectedTagIds = new Set(selectedRegistry.map((tag) => tag.id));
  const selectedMembers = members.filter((member) =>
    selectedTagIds.has(member.tagId),
  );
  const selectedGroupIds = new Set(
    selectedMembers.map((member) => member.groupId),
  );
  return {
    includeDerived: options.includeDerived,
    organization: options.includeDerived
      ? {
          views: selectionViews(views, included),
          tags: selectedRegistry.map((tag) => ({
            ...tag,
            createdAt: tag.createdAt.getTime(),
            lastUsedAt: tag.lastUsedAt?.getTime() ?? null,
          })),
          groups: groups
            .filter((group) => selectedGroupIds.has(group.id))
            .map((group) => ({
              ...group,
              createdAt: group.createdAt.getTime(),
            })),
          members: selectedMembers,
          folderViews: Object.fromEntries(
            Object.entries((await getPrefs()).folderViews).filter(([id]) =>
              included.has(id),
            ),
          ),
          folderRules: Object.fromEntries(
            Object.entries((await getPrefs()).folderRules).filter(([id]) =>
              included.has(id),
            ),
          ),
        }
      : undefined,
    folders: allFolders.filter((folder) => included.has(folder.id)),
    items: rows.map((save) => ({
      save,
      directory: saveDir(save.id),
      folderIds: memberships
        .filter((membership) => membership.saveId === save.id)
        .map((membership) => membership.folderId),
    })),
  };
}

async function exportSaves(
  ids: ReadonlyArray<string>,
  directory: string,
  options: { includeDerived?: boolean } = {},
) {
  return exportFiles({
    directory,
    ...(await exportSelection(ids, options)),
  });
}

export function exportSavesToDirectory(
  ids: ReadonlyArray<string>,
  directory: string,
  options: { includeDerived?: boolean } = {},
) {
  return runLibraryTransfer(() => exportSaves(ids, directory, options));
}

const pad = (value: number) => String(value).padStart(2, "0");

function localDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Names an export after the folder or Save it holds, e.g. "Geoid (Pond Export 2026-11-22)". */
export async function exportFilesName(
  ids: ReadonlyArray<string>,
  options: { fromFolders?: boolean } = {},
  now = new Date(),
) {
  const selection = await exportSelection(ids);
  return exportName(selection.items, selection.folders, options, now);
}

/** A single Save names its export unless the export came from a folder; otherwise the shared folder does. */
export function exportName(
  items: ReadonlyArray<ExportItem>,
  folders: ReadonlyArray<ExportFolder>,
  { fromFolders = false }: { fromFolders?: boolean },
  now: Date,
) {
  const folder = sharedFolderPath(items, folders).at(-1);
  const only = items.length === 1 ? items[0]?.save : null;
  const title = only ? safeName(only.title || only.id) : undefined;
  const subject = fromFolders ? (folder ?? title) : (title ?? folder);
  return subject
    ? `${subject} (Pond Export ${localDate(now)})`
    : `Pond Export ${localDate(now)}`;
}

/** The first of `name`, `name 2`, `name 3`… that doesn't exist in `parent`. */
export async function availableExportPath(
  parent: string,
  name: string,
  extension = "",
) {
  for (let count = 1; ; count += 1) {
    const path = join(
      parent,
      `${count === 1 ? name : `${name} ${count}`}${extension}`,
    );
    if (!(await stat(path).catch(() => null))) {
      return path;
    }
  }
}

export function exportSavesToFolder(
  ids: ReadonlyArray<string>,
  destination: string,
) {
  return runLibraryTransfer(async () => {
    await mkdir(destination, { recursive: true });
    const result = await exportFiles({
      directory: destination,
      startAtSharedFolder: true,
      ...(await exportSelection(ids)),
    });
    return { ...result, path: destination };
  });
}

export function exportSavesToZip(
  ids: ReadonlyArray<string>,
  destination: string,
) {
  return runLibraryTransfer(async () => {
    const staging = await mkdtemp(join(dirname(destination), ".pond-export-"));
    try {
      const folder = join(staging, basename(destination, ".zip"));
      await mkdir(folder);
      const result = await exportFiles({
        directory: folder,
        startAtSharedFolder: true,
        ...(await exportSelection(ids)),
      });
      await zipDirectory(folder, destination);
      return { exported: result.exported, path: destination };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  });
}

export function exportSavesToEaglePackage(
  ids: ReadonlyArray<string>,
  destination: string,
) {
  return runLibraryTransfer(async () => {
    const selection = await exportSelection(ids);
    return exportEaglePackage(
      {
        items: selection.items.map((item) => ({ ...item, folderIds: [] })),
        folders: [],
      },
      destination,
    );
  });
}
