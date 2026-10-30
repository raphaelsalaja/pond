import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import log from "electron-log/main.js";
import { z } from "zod";
import type { OkResult } from "../../shared/query-contracts-shared";
import type { EagleImportProgress } from "../../shared/saves-import-contracts";
import {
  EagleCommentsSchema,
  EagleVideoNotesSchema,
  foldAnnotationsIntoNotes,
} from "../lib/eagle-annotations";
import {
  approximateEagleRules,
  EaglePaletteSchema,
  EagleSmartFolderSchema,
  EagleTagGroupSchema,
  eaglePaletteColor,
  eagleSmartFolderQuery,
  unsupportedEagleRules,
} from "./eagle-metadata";
import { importFolderTree, setSaveFolders } from "./folders";
import { runLibraryTransfer } from "./library-transfers";
import { createManualSave, type ManualSaveInput } from "./manual-import";
import { createView, listViews } from "./saved-views";
import { addTagsToGroup, createGroup } from "./tag-groups";
import { createTag, listTags } from "./tags";

interface EagleFolder {
  id?: string;
  name?: string;
  password?: string;
  color?: string;
  iconColor?: string;
  children?: EagleFolder[];
}

const EagleFolderSchema: z.ZodType<EagleFolder> = z.lazy(() =>
  z.object({
    id: z.string().optional().catch(undefined),
    name: z.string().optional().catch(undefined),
    password: z.string().optional().catch(undefined),
    color: z.string().optional().catch(undefined),
    iconColor: z.string().optional().catch(undefined),
    children: z.array(EagleFolderSchema).optional().catch(undefined),
  }),
);

const EagleLibrarySchema = z.object({
  folders: z.array(EagleFolderSchema).default([]),
  smartFolders: z.array(z.json()).default([]),
  tagsGroups: z.array(EagleTagGroupSchema).default([]),
  quickAccess: z.array(z.json()).default([]),
});

/** Eagle writes `modificationTime`, `imageCount`, and `parent` as bookkeeping; the tree already carries `parent`. */
const EAGLE_SMART_FOLDER_KEYS = new Set([
  "id",
  "name",
  "conditions",
  "children",
  "modificationTime",
  "imageCount",
  "parent",
]);

const EagleItemMetaSchema = z.object({
  id: z.string().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
  tags: z.array(z.string()).optional().catch(undefined),
  folders: z.array(z.string()).optional().catch(undefined),
  url: z.string().optional().catch(undefined),
  ext: z.string().optional().catch(undefined),
  annotation: z.string().optional().catch(undefined),
  width: z.number().optional().catch(undefined),
  height: z.number().optional().catch(undefined),
  isDeleted: z.boolean().optional().catch(undefined),
  star: z.number().optional().catch(undefined),
  palettes: z.array(EaglePaletteSchema).optional().catch(undefined),
  modificationTime: z.number().optional().catch(undefined),
  btime: z.number().optional().catch(undefined),
  comments: EagleCommentsSchema.optional(),
  videoMarks: EagleVideoNotesSchema.optional(),
  notes: EagleVideoNotesSchema.optional(),
});

export interface EagleLockedFolder {
  id: string;
  name: string;
  reason: "password" | "parent_locked";
}

interface EagleImportCounts {
  imported: number;
  skipped: number;
  failed: number;
  deletedSkipped: number;
  lockedFolders: EagleLockedFolder[];
  droppedFields: string[];
  approximatedRules: string[];
}

export type EagleImportResult = EagleImportCounts & OkResult;

type EagleImportProgressUpdate = Omit<EagleImportProgress, "id">;

interface EagleImportOptions {
  dryRun?: boolean;
  onProgress?: (progress: EagleImportProgressUpdate) => void;
}

export interface FlattenedEagleFolder {
  id: string;
  name: string;
  parentId: string | null;
  color?: string | null;
  sortOrder: number;
}

/** Eagle stores a bookmark as an `.url` Internet Shortcut beside a page screenshot. */
export function isEagleBookmark(meta: { ext?: string; url?: string }) {
  return meta.ext?.toLowerCase() === "url" && Boolean(meta.url?.trim());
}

export function partitionEagleItemFiles(
  files: readonly string[],
  bookmark = false,
) {
  const visible = files.filter(
    (name) => name !== "metadata.json" && !name.startsWith("."),
  );
  const thumbnail =
    visible.find((name) => name.toLowerCase().endsWith("_thumbnail.png")) ??
    null;
  return {
    mediaFiles: visible.filter(
      (name) =>
        name !== thumbnail &&
        !(bookmark && name.toLowerCase().endsWith(".url")),
    ),
    thumbnail,
  };
}

export function collectLockedEagleFolders(
  folders: EagleFolder[],
  parentLocked = false,
): EagleLockedFolder[] {
  const out: EagleLockedFolder[] = [];
  for (const folder of folders) {
    const lockedHere = Boolean(folder.password);
    const skipped = lockedHere || parentLocked;
    if (folder.id && skipped) {
      out.push({
        id: folder.id,
        name: folder.name?.trim() || "Untitled",
        reason: lockedHere ? "password" : "parent_locked",
      });
    }
    if (folder.children?.length) {
      out.push(...collectLockedEagleFolders(folder.children, skipped));
    }
  }
  return out;
}

export function flattenEagleFolders(
  folders: EagleFolder[],
  parentId: string | null = null,
): FlattenedEagleFolder[] {
  const out: FlattenedEagleFolder[] = [];
  for (const [sortOrder, folder] of folders.entries()) {
    if (!folder.id || folder.password) continue;
    out.push({
      id: folder.id,
      name: folder.name?.trim() || "Untitled",
      parentId,
      color: folder.color ?? folder.iconColor ?? null,
      sortOrder,
    });
    if (folder.children?.length) {
      out.push(...flattenEagleFolders(folder.children, folder.id));
    }
  }
  return out;
}

async function readJson<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    if (errnoCode(cause) !== "ENOENT") {
      log.warn("[pond eagle] failed to read json", path, cause);
    }
    return null;
  }
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function errnoCode(cause: unknown): string | null {
  return cause instanceof Error && "code" in cause ? String(cause.code) : null;
}

async function resolveImagesDir(libraryPath: string): Promise<string | null> {
  const direct = join(libraryPath, "images");
  try {
    if ((await stat(direct)).isDirectory()) return direct;
  } catch {}

  try {
    const entries = await readdir(libraryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".library")) continue;
      const nested = join(libraryPath, entry.name, "images");
      try {
        if ((await stat(nested)).isDirectory()) return nested;
      } catch {}
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveLibraryMeta(
  libraryPath: string,
  imagesDir: string,
): Promise<z.infer<typeof EagleLibrarySchema>> {
  for (const path of [
    join(libraryPath, "metadata.json"),
    join(imagesDir, "..", "metadata.json"),
  ]) {
    const doc = await readJson(path, EagleLibrarySchema);
    if (doc) return doc;
  }
  return { folders: [], smartFolders: [], tagsGroups: [], quickAccess: [] };
}

function emptyResult(error: string): EagleImportResult {
  return {
    ok: false,
    imported: 0,
    skipped: 0,
    failed: 0,
    deletedSkipped: 0,
    lockedFolders: [],
    droppedFields: [],
    approximatedRules: [],
    error,
  };
}

export async function dryRunEagleLibrary(
  libraryPath: string,
): Promise<EagleImportResult> {
  return importEagleLibrary(libraryPath, { dryRun: true });
}

async function importEagle(
  libraryPath: string,
  opts: EagleImportOptions = {},
): Promise<EagleImportResult> {
  const imagesDir = await resolveImagesDir(libraryPath);
  if (!imagesDir) return emptyResult("not_eagle_library");

  const libraryMeta = await resolveLibraryMeta(libraryPath, imagesDir);
  const lockedFolders = collectLockedEagleFolders(libraryMeta.folders);
  const mapped = opts.dryRun
    ? new Map<string, string>()
    : await importFolderTree(flattenEagleFolders(libraryMeta.folders));

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let deletedSkipped = 0;
  const dropped = new Set<string>();
  const approximated = new Set<string>();
  if (libraryMeta.quickAccess.length) dropped.add("Quick Access shortcuts");
  const existingViews = opts.dryRun ? [] : await listViews();
  const ruleFolders = opts.dryRun
    ? new Map(
        flattenEagleFolders(libraryMeta.folders).map((folder) => [
          folder.id,
          folder.id,
        ]),
      )
    : mapped;
  async function importSmartFolders(
    entries: z.infer<typeof EagleLibrarySchema>["smartFolders"],
    parentId: string | null = null,
  ): Promise<void> {
    for (const raw of entries) {
      const parsed = EagleSmartFolderSchema.safeParse(raw);
      if (!parsed.success) {
        dropped.add("Unrecognized Smart Folder metadata");
        continue;
      }
      const fields = z.record(z.string(), z.json()).parse(raw);
      for (const [field, value] of Object.entries(fields)) {
        if (
          EAGLE_SMART_FOLDER_KEYS.has(field) ||
          value === "" ||
          value === null
        )
          continue;
        dropped.add(`${parsed.data.name}: ${field}`);
      }
      const query = eagleSmartFolderQuery(parsed.data, ruleFolders);
      if (!query) {
        for (const reason of unsupportedEagleRules(parsed.data, ruleFolders))
          dropped.add(reason);
        if (parsed.data.children.length)
          dropped.add(
            `Children of unsupported Smart Folder: ${parsed.data.name}`,
          );
        continue;
      }
      for (const rule of approximateEagleRules(parsed.data, ruleFolders))
        approximated.add(rule);
      const question = `eagle:${parsed.data.id}`;
      const kind =
        parsed.data.children.length || parsed.data.conditions.length === 0
          ? "group"
          : "smart_folder";
      let id = existingViews.find((view) => view.question === question)?.id;
      if (!opts.dryRun && !id) {
        const created = await createView({
          name: parsed.data.name,
          kind,
          question,
          query,
          parentId,
        });
        if (!created.ok || !created.id) {
          dropped.add(`Smart Folder could not be created: ${parsed.data.name}`);
          continue;
        }
        id = created.id;
      }
      await importSmartFolders(parsed.data.children, id ?? null);
    }
  }
  await importSmartFolders(libraryMeta.smartFolders);
  if (!opts.dryRun) {
    const knownTags = new Set(
      (await listTags()).map((tag) => tag.name.toLowerCase()),
    );
    for (const group of libraryMeta.tagsGroups) {
      await createGroup({
        name: group.name,
        color: group.color,
        description: group.description,
      });
      for (const name of group.tags) {
        if (!knownTags.has(name.toLowerCase())) {
          await createTag({ name });
          knownTags.add(name.toLowerCase());
        }
      }
      await addTagsToGroup(group.tags, group.name);
    }
  }
  const availableFolderIds = new Set(
    flattenEagleFolders(libraryMeta.folders).map((folder) => folder.id),
  );

  let entries: Dirent[];
  try {
    entries = await readdir(imagesDir, { withFileTypes: true });
  } catch (err) {
    log.warn("[pond eagle] readdir failed", imagesDir, err);
    return emptyResult("read_failed");
  }

  const itemEntries = entries.filter(
    (entry) => entry.isDirectory() && entry.name.endsWith(".info"),
  );
  let processed = 0;
  const reportProgress = () =>
    opts.onProgress?.({
      processed,
      total: itemEntries.length,
      imported,
      skipped,
      failed,
    });
  reportProgress();

  for (const entry of itemEntries) {
    try {
      const itemDir = join(imagesDir, entry.name);

      const meta = await readJson(
        join(itemDir, "metadata.json"),
        EagleItemMetaSchema,
      );
      if (!meta?.id) {
        failed += 1;
        continue;
      }
      if (meta.isDeleted) {
        deletedSkipped += 1;
        skipped += 1;
        continue;
      }

      let files: string[];
      try {
        files = await readdir(itemDir);
      } catch {
        failed += 1;
        continue;
      }

      const bookmark = isEagleBookmark(meta);
      const { mediaFiles, thumbnail } = partitionEagleItemFiles(
        files,
        bookmark,
      );
      if (mediaFiles.length === 0 && !bookmark) {
        skipped += 1;
        continue;
      }

      const tags = [...(meta.tags ?? [])];
      const filePaths = mediaFiles.map((name) => join(itemDir, name));
      const palettes = (meta.palettes ?? [])
        .map(eaglePaletteColor)
        .filter(Boolean);
      if ((meta.folders ?? []).some((id) => !availableFolderIds.has(id)))
        dropped.add("Unavailable folder membership");

      if (opts.dryRun) {
        imported += 1;
        continue;
      }

      try {
        const input: ManualSaveInput = {
          title: meta.name?.trim() || basename(mediaFiles[0] ?? meta.id),
          url: meta.url?.trim() || null,
          note: foldAnnotationsIntoNotes(
            meta.annotation?.trim() || null,
            meta.comments,
            meta.videoMarks ?? meta.notes,
          ),
          tags,
          filePaths,
          thumbnailPath: thumbnail ? join(itemDir, thumbnail) : null,
          sourceId: `eagle:${meta.id}`,
          importedFrom: "eagle",
          savedAt: meta.modificationTime
            ? new Date(meta.modificationTime)
            : undefined,
          createdAt: meta.btime ? new Date(meta.btime) : undefined,
        };
        if (meta.width !== undefined) input.width = meta.width;
        if (meta.height !== undefined) input.height = meta.height;
        if (meta.star != null && meta.star > 0) input.rating = meta.star;
        if (palettes.length > 0) input.dominantColors = palettes;
        const res = await createManualSave(input);
        if (!res.ok) {
          failed += 1;
          continue;
        }
        const pondFolderIds = (meta.folders ?? [])
          .map((id) => mapped.get(id))
          .filter((id): id is string => Boolean(id));
        if ((meta.folders ?? []).some((id) => !mapped.has(id))) {
          dropped.add("locked-folder membership");
        }
        if (res.id && pondFolderIds.length > 0) {
          await setSaveFolders(res.id, pondFolderIds);
        }
        if (res.skipped) skipped += 1;
        else imported += 1;
      } catch (err) {
        log.warn("[pond eagle] item import failed", meta.id, err);
        failed += 1;
      }
    } finally {
      processed += 1;
      reportProgress();
    }
  }

  const counts: EagleImportCounts = {
    imported,
    skipped,
    failed,
    deletedSkipped,
    lockedFolders,
    droppedFields: [...dropped],
    approximatedRules: [...approximated],
  };
  return imported > 0 || skipped > 0 || lockedFolders.length > 0
    ? { ok: true, ...counts }
    : { ok: false, error: "nothing_imported", ...counts };
}

export function importEagleLibrary(
  libraryPath: string,
  opts: EagleImportOptions = {},
) {
  return runLibraryTransfer(() => importEagle(libraryPath, opts));
}
