import { createReadStream, createWriteStream } from "node:fs";
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { pipeline } from "node:stream/promises";
import type { Folder, Save } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import { isAuxiliaryKind, isThumbnailKind } from "@shared/save-file-names";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { ulid } from "ulid";
import { z } from "zod";
import { getDb } from "../db";
import {
  EagleCommentsSchema,
  EagleVideoNotesSchema,
  foldAnnotationsIntoNotes,
} from "../lib/eagle-annotations";
import { EaglePaletteSchema, eaglePaletteColor } from "./eagle-metadata";
import { executeBatch } from "./executor";
import {
  deleteFolder,
  importFolderTree,
  listFolders,
  setSaveFolders,
} from "./folders";
import { runLibraryTransfer } from "./library-transfers";
import { createManualSave, type ManualSaveInput } from "./manual-import";
import {
  exportLibraryMedia,
  readLibraryMedia,
} from "./storage/library-media-storage";
import {
  checkTransferCancellation,
  transferPhase,
  transferProgress,
} from "./transfer-jobs";

const DEFAULT_LIMITS = {
  archiveBytes: 512 * 1024 * 1024,
  files: 10_000,
  fileBytes: 512 * 1024 * 1024,
  totalBytes: 8 * 1024 * 1024 * 1024,
  compressionRatio: 1_000,
  jsonBytes: 4 * 1024 * 1024,
} satisfies EaglePackageLimits;

export interface EaglePackageLimits {
  archiveBytes: number;
  files: number;
  fileBytes: number;
  totalBytes: number;
  compressionRatio: number;
  jsonBytes: number;
}

type EagleExportSave = Pick<
  Save,
  | "id"
  | "title"
  | "url"
  | "tags"
  | "notes"
  | "files"
  | "width"
  | "height"
  | "rating"
  | "dominantColors"
  | "savedAt"
  | "createdAt"
>;

export interface EaglePackageExportItem {
  save: EagleExportSave;
  directory: string;
  folderIds: string[];
}

type EaglePackageFolder = Pick<Folder, "id" | "name" | "parentId"> &
  Partial<Pick<Folder, "color" | "sortOrder">>;

export interface EaglePackageExportInput {
  items: readonly EaglePackageExportItem[];
  folders?: readonly EaglePackageFolder[];
}

interface EagleFolder {
  id: string;
  name?: string;
  parentId?: string | null;
  color?: string | null;
  iconColor?: string | null;
  children?: EagleFolder[];
}

const EagleFolderSchema: z.ZodType<EagleFolder> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: z.string().optional().catch(undefined),
    parentId: z.string().nullable().optional().catch(undefined),
    color: z.string().nullable().optional().catch(undefined),
    iconColor: z.string().nullable().optional().catch(undefined),
    children: z.array(EagleFolderSchema).optional().catch(undefined),
  }),
);

const EagleItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional().catch(undefined),
  size: z.number().nonnegative().optional().catch(undefined),
  btime: z.number().optional().catch(undefined),
  mtime: z.number().optional().catch(undefined),
  ext: z.string().optional().catch(undefined),
  tags: z.array(z.string()).optional().catch(undefined),
  folders: z.array(z.string()).optional().catch(undefined),
  isDeleted: z.boolean().optional().catch(undefined),
  url: z.string().optional().catch(undefined),
  annotation: z.string().optional().catch(undefined),
  modificationTime: z.number().optional().catch(undefined),
  width: z.number().optional().catch(undefined),
  height: z.number().optional().catch(undefined),
  star: z.number().optional().catch(undefined),
  palettes: z.array(EaglePaletteSchema).optional().catch(undefined),
  comments: EagleCommentsSchema.optional(),
  videoMarks: EagleVideoNotesSchema.optional(),
  notes: EagleVideoNotesSchema.optional(),
});
type EagleItem = z.infer<typeof EagleItemSchema>;

const EaglePackSchema = z.object({
  images: z.array(EagleItemSchema).default([]),
  folder: EagleFolderSchema.optional().catch(undefined),
});

const EagleLibraryHeaderSchema = z.object({
  folders: z.array(EagleFolderSchema),
});

export interface EaglePackageFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  color?: string | null;
  sortOrder?: number;
}

export interface EaglePackageImportItem {
  metadata: EagleItem;
  mediaPaths: string[];
  thumbnailPath: string | null;
}

interface EaglePackageFolderImport {
  mapped: Map<string, string>;
  createdIds: string[];
}

interface EaglePackageItemImportResult {
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

export interface EaglePackageImportRuntime {
  folders: (
    nodes: EaglePackageFolderNode[],
  ) => Promise<EaglePackageFolderImport>;
  existing: (eagleId: string) => Promise<string | null>;
  importItem: (
    item: EaglePackageImportItem,
    folderIds: string[],
  ) => Promise<EaglePackageItemImportResult>;
  rollback: (saveIds: string[], folderIds: string[]) => Promise<void>;
}

interface PackageFile {
  path: string;
  absolutePath: string;
  size: number;
}

interface PreparedPackage {
  root: string;
  cleanup: () => Promise<void>;
}

function sourceId(id: string): string {
  return `eagle:${id}`;
}

const runtime: EaglePackageImportRuntime = {
  async folders(nodes) {
    const before = new Set((await listFolders()).map((folder) => folder.id));
    const mapped = await importFolderTree(nodes, true);
    return {
      mapped,
      createdIds: [...mapped.values()].filter((id) => !before.has(id)),
    };
  },
  async existing(eagleId) {
    const db = await getDb();
    const row = db
      .select({ id: saves.id })
      .from(saves)
      .where(
        and(eq(saves.source, "local"), eq(saves.sourceId, sourceId(eagleId))),
      )
      .all()[0];
    return row?.id ?? null;
  },
  async importItem(item, folderIds) {
    const metadata = item.metadata;
    const mediaPaths =
      item.mediaPaths.length > 0
        ? item.mediaPaths
        : item.thumbnailPath
          ? [item.thumbnailPath]
          : [];
    const input: ManualSaveInput = {
      title: metadata.name?.trim() || basename(mediaPaths[0] ?? metadata.id),
      url: metadata.url?.trim() || null,
      note: foldAnnotationsIntoNotes(
        metadata.annotation?.trim() || null,
        metadata.comments,
        metadata.videoMarks ?? metadata.notes,
      ),
      tags: metadata.tags ?? [],
      filePaths: mediaPaths,
      thumbnailPath:
        item.mediaPaths.length > 0 ? item.thumbnailPath : undefined,
      sourceId: sourceId(metadata.id),
      importedFrom: "eagle",
      savedAt: timestampDate(metadata.modificationTime ?? metadata.mtime),
      createdAt: timestampDate(metadata.btime),
      rating: metadata.star,
      dominantColors: (metadata.palettes ?? []).map(eaglePaletteColor),
    };
    if (metadata.width !== undefined) input.width = metadata.width;
    if (metadata.height !== undefined) input.height = metadata.height;
    const result = await createManualSave(input);
    if (result.ok && result.id && folderIds.length > 0) {
      const assigned = await setSaveFolders(result.id, folderIds);
      if (!assigned.ok)
        return {
          ok: false,
          id: result.id,
          error: "Could not assign imported folders.",
        };
    }
    return result;
  },
  async rollback(saveIds, folderIds) {
    const db = await getDb();
    if (saveIds.length > 0) {
      const rows = db
        .select()
        .from(saves)
        .where(inArray(saves.id, saveIds))
        .all();
      if (rows.length > 0) {
        await executeBatch(
          rows.map((row) => ({
            kind: "purge" as const,
            model: "save" as const,
            id: row.id,
            before: row,
            meta: {
              actor: "user" as const,
              actorReason: "eagle-package-rollback",
            },
          })),
        );
      }
    }
    for (const id of [...folderIds].reverse()) await deleteFolder(id);
  },
};

function timestampDate(value: number | undefined): Date | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function safeSegment(value: string): string {
  const cleaned = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? "_" : character,
  )
    .join("")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim()
    .replace(/^\.+$|[. ]+$/g, "")
    .slice(0, 120);
  return cleaned || "Untitled";
}

function assertPortablePath(path: string): void {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    !path ||
    path !== normalized ||
    isAbsolute(path) ||
    path.includes("\0") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("The Eagle package contains an unsafe path.");
  }
}

function targetFor(root: string, portablePath: string): string {
  assertPortablePath(portablePath);
  const target = resolve(root, ...portablePath.split("/"));
  const child = relative(root, target);
  if (
    child === "" ||
    child === ".." ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  ) {
    throw new Error("The Eagle package contains an unsafe path.");
  }
  return target;
}

function resolvedLimits(
  limits: Partial<EaglePackageLimits> = {},
): EaglePackageLimits {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  for (const value of Object.values(resolved)) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error("Eagle package limits must be positive integers.");
  }
  return resolved;
}

async function scanDirectory(
  directory: string,
  limits: EaglePackageLimits,
): Promise<PackageFile[]> {
  const rootMetadata = await lstat(directory);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory())
    throw new Error("An Eagle package directory must be a real directory.");
  const root = await realpath(directory);
  const files: PackageFile[] = [];
  const names = new Set<string>();
  let totalBytes = 0;

  async function visit(current: string, segments: string[]): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      checkTransferCancellation();
      const nextSegments = [...segments, entry.name];
      const portablePath = nextSegments.join("/");
      assertPortablePath(portablePath);
      const absolutePath = targetFor(root, portablePath);
      const metadata = await lstat(absolutePath);
      if (metadata.isSymbolicLink())
        throw new Error("Eagle packages cannot contain symbolic links.");
      if (metadata.isDirectory()) {
        await visit(absolutePath, nextSegments);
        continue;
      }
      if (!metadata.isFile())
        throw new Error("Eagle packages may contain only regular files.");
      const actual = await realpath(absolutePath);
      if (actual !== absolutePath)
        throw new Error("An Eagle package file resolves outside its package.");
      const portableName = portablePath.toLocaleLowerCase("en-US");
      if (names.has(portableName))
        throw new Error(
          "Eagle package paths must be unique across portable filesystems.",
        );
      names.add(portableName);
      if (metadata.size > limits.fileBytes)
        throw new Error("An Eagle package file exceeds the extraction limit.");
      totalBytes += metadata.size;
      if (totalBytes > limits.totalBytes)
        throw new Error("The Eagle package exceeds the extraction limit.");
      files.push({ path: portablePath, absolutePath, size: metadata.size });
      if (files.length > limits.files)
        throw new Error("The Eagle package contains too many files.");
    }
  }

  await visit(root, []);
  return files;
}

async function copyDirectoryPackage(
  source: string,
  staging: string,
  limits: EaglePackageLimits,
): Promise<void> {
  const files = await scanDirectory(source, limits);
  await transferPhase("Staging Eagle package", files.length);
  for (const file of files) {
    checkTransferCancellation();
    const target = targetFor(staging, file.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file.absolutePath, target, constants.COPYFILE_EXCL);
    if ((await stat(target)).size !== file.size)
      throw new Error("An Eagle package file changed while it was staged.");
    await transferProgress(file.path, file.size);
  }
}

interface CompressedZipData {
  compressedSize: number;
  uncompressedSize: number;
}

interface BoundedZipObject {
  name: string;
  unsafeOriginalName?: string;
  dir: boolean;
  unixPermissions: number | string | null;
  _data?: CompressedZipData;
  async: (type: "nodebuffer") => Promise<Buffer>;
}

const ZipModeSchema = z.union([
  z.number(),
  z.string().transform((value) => Number.parseInt(value, 8)),
  z.null(),
]);

function zipMode(value: number | string | null): number | null {
  return ZipModeSchema.parse(value);
}

async function extractArchive(
  source: string,
  staging: string,
  limits: EaglePackageLimits,
): Promise<void> {
  const metadata = await lstat(source);
  if (metadata.isSymbolicLink() || !metadata.isFile())
    throw new Error("An Eagle package archive must be a regular file.");
  if (metadata.size > limits.archiveBytes)
    throw new Error("The Eagle package archive exceeds the read limit.");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await readFile(source), {
    checkCRC32: true,
    createFolders: false,
  });
  /** SAFETY: JSZip exposes these stable entry fields at runtime; its public declaration omits only compressed-size metadata. */
  const entries = Object.values(zip.files) as BoundedZipObject[];
  const files = entries.filter((entry) => !entry.dir);
  if (files.length > limits.files)
    throw new Error("The Eagle package contains too many files.");
  const names = new Set<string>();
  let totalBytes = 0;
  for (const entry of entries) {
    const original = entry.unsafeOriginalName ?? entry.name;
    if (original !== entry.name)
      throw new Error("The Eagle package contains an unsafe archive path.");
    assertPortablePath(original.replace(/\/$/, ""));
    const mode = zipMode(entry.unixPermissions);
    if (mode !== null && (mode & 0o170000) === 0o120000)
      throw new Error("Eagle packages cannot contain symbolic links.");
    if (entry.dir) continue;
    const key = entry.name.toLocaleLowerCase("en-US");
    if (names.has(key))
      throw new Error(
        "Eagle package paths must be unique across portable filesystems.",
      );
    names.add(key);
    const compressed = entry._data?.compressedSize;
    const uncompressed = entry._data?.uncompressedSize;
    if (
      compressed === undefined ||
      uncompressed === undefined ||
      !Number.isSafeInteger(compressed) ||
      !Number.isSafeInteger(uncompressed) ||
      uncompressed > limits.fileBytes ||
      (uncompressed > 0 &&
        uncompressed / Math.max(1, compressed) > limits.compressionRatio)
    ) {
      throw new Error("An Eagle package entry exceeds the extraction limit.");
    }
    totalBytes += uncompressed;
    if (totalBytes > limits.totalBytes)
      throw new Error("The Eagle package exceeds the extraction limit.");
  }
  await transferPhase("Extracting Eagle package", files.length);
  for (const entry of files) {
    checkTransferCancellation();
    const bytes = await entry.async("nodebuffer");
    if (bytes.byteLength !== entry._data?.uncompressedSize)
      throw new Error("An Eagle package entry changed during extraction.");
    const target = targetFor(staging, entry.name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    await transferProgress(entry.name, bytes.byteLength);
  }
}

async function preparePackage(
  source: string,
  limits: EaglePackageLimits,
): Promise<PreparedPackage> {
  const metadata = await lstat(source);
  const staging = await mkdtemp(join(tmpdir(), "pond-eagle-package-"));
  try {
    if (metadata.isSymbolicLink())
      throw new Error("Eagle package sources cannot be symbolic links.");
    if (metadata.isDirectory())
      await copyDirectoryPackage(source, staging, limits);
    else await extractArchive(source, staging, limits);
    return {
      root: staging,
      cleanup: () => rm(staging, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function readPackageJson<T>(
  file: PackageFile,
  schema: z.ZodType<T>,
  limits: EaglePackageLimits,
): Promise<T> {
  if (file.size > limits.jsonBytes)
    throw new Error("An Eagle package metadata file is too large.");
  try {
    return schema.parse(JSON.parse(await readFile(file.absolutePath, "utf8")));
  } catch (error) {
    if (error instanceof Error && error.message.includes("too large"))
      throw error;
    throw new Error(`The Eagle package metadata is invalid: ${file.path}`);
  }
}

function flattenFolders(
  folders: readonly EagleFolder[],
  parentId: string | null = null,
): EaglePackageFolderNode[] {
  const nodes: EaglePackageFolderNode[] = [];
  for (const [sortOrder, folder] of folders.entries()) {
    const resolvedParent = folder.parentId ?? parentId;
    nodes.push({
      id: folder.id,
      name: folder.name?.trim() || folder.id,
      parentId: resolvedParent,
      color: folder.color ?? folder.iconColor ?? null,
      sortOrder,
    });
    nodes.push(...flattenFolders(folder.children ?? [], folder.id));
  }
  return nodes;
}

function validateFolders(nodes: readonly EaglePackageFolderNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length)
    throw new Error("The Eagle package contains duplicate folder identities.");
  for (const node of nodes) {
    const seen = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId) {
      if (seen.has(parentId) || !byId.has(parentId))
        throw new Error("The Eagle package folder hierarchy is invalid.");
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
}

function visibleItemFile(path: string): boolean {
  const name = basename(path);
  return name !== "metadata.json" && !name.startsWith(".");
}

async function parsePackage(
  root: string,
  limits: EaglePackageLimits,
): Promise<{
  folders: EaglePackageFolderNode[];
  items: EaglePackageImportItem[];
}> {
  const files = await scanDirectory(root, limits);
  const packFiles = files.filter((file) => basename(file.path) === "pack.json");
  if (packFiles.length > 1)
    throw new Error("The Eagle package contains multiple pack manifests.");
  const pack = packFiles[0]
    ? await readPackageJson(packFiles[0], EaglePackSchema, limits)
    : null;
  const itemMetadataFiles = files.filter(
    (file) =>
      basename(file.path) === "metadata.json" &&
      basename(dirname(file.path)).endsWith(".info"),
  );
  const metadataById = new Map<
    string,
    { metadata: EagleItem; directory: string }
  >();
  for (const file of itemMetadataFiles) {
    const metadata = await readPackageJson(file, EagleItemSchema, limits);
    if (metadataById.has(metadata.id))
      throw new Error("The Eagle package contains duplicate Save identities.");
    metadataById.set(metadata.id, {
      metadata,
      directory: dirname(file.path),
    });
  }
  for (const metadata of pack?.images ?? []) {
    if (metadataById.has(metadata.id)) continue;
    const suffix = `${metadata.id}.info`;
    const directories = new Set(
      files
        .filter((file) => dirname(file.path).endsWith(suffix))
        .map((file) => dirname(file.path)),
    );
    if (directories.size !== 1)
      throw new Error(`The Eagle package item ${metadata.id} is missing.`);
    const [directory] = directories;
    if (!directory)
      throw new Error(`The Eagle package item ${metadata.id} is missing.`);
    metadataById.set(metadata.id, { metadata, directory });
  }
  if (metadataById.size === 0)
    throw new Error("The selected source is not an Eagle package.");

  let folderNodes = flattenFolders(pack?.folder ? [pack.folder] : []);
  if (folderNodes.length === 0) {
    const libraryHeaders = files.filter(
      (file) =>
        basename(file.path) === "metadata.json" &&
        !basename(dirname(file.path)).endsWith(".info"),
    );
    for (const file of libraryHeaders) {
      const parsed = await readPackageJson(file, z.json(), limits);
      const header = EagleLibraryHeaderSchema.safeParse(parsed);
      if (header.success) {
        folderNodes = flattenFolders(header.data.folders);
        break;
      }
    }
  }
  const knownFolders = new Set(folderNodes.map((node) => node.id));
  for (const { metadata } of metadataById.values()) {
    for (const id of metadata.folders ?? []) {
      if (!knownFolders.has(id)) {
        knownFolders.add(id);
        folderNodes.push({ id, name: id, parentId: null });
      }
    }
  }
  validateFolders(folderNodes);

  const items: EaglePackageImportItem[] = [];
  for (const { metadata, directory } of metadataById.values()) {
    if (metadata.isDeleted) continue;
    const prefix = `${directory}/`;
    const siblings = files.filter((file) => {
      const child = file.path.startsWith(prefix)
        ? file.path.slice(prefix.length)
        : "";
      return Boolean(child) && !child.includes("/") && visibleItemFile(child);
    });
    const thumbnails = siblings.filter((file) =>
      basename(file.path).toLowerCase().endsWith("_thumbnail.png"),
    );
    if (thumbnails.length > 1)
      throw new Error(
        `The Eagle package item ${metadata.id} has multiple thumbnails.`,
      );
    const thumbnail = thumbnails[0] ?? null;
    const media = siblings.filter((file) => file !== thumbnail);
    if (media.length === 0 && !metadata.url?.trim() && !thumbnail)
      throw new Error(`The Eagle package item ${metadata.id} has no content.`);
    items.push({
      metadata,
      mediaPaths: media.map((file) => file.absolutePath),
      thumbnailPath: thumbnail?.absolutePath ?? null,
    });
  }
  return { folders: folderNodes, items };
}

const imports = new WeakMap<EaglePackageImportRuntime, Promise<void>>();

async function importPackage(
  source: string,
  dependencies: EaglePackageImportRuntime,
  limits: EaglePackageLimits,
) {
  const operation = (imports.get(dependencies) ?? Promise.resolve()).then(
    async () => {
      const prepared = await preparePackage(source, limits);
      try {
        const parsed = await parsePackage(prepared.root, limits);
        const folders = await dependencies.folders(parsed.folders);
        const importedIds: string[] = [];
        let imported = 0;
        let skipped = 0;
        try {
          await transferPhase("Importing Eagle package", parsed.items.length);
          for (const item of parsed.items) {
            checkTransferCancellation();
            const existingId = await dependencies.existing(item.metadata.id);
            if (existingId) {
              skipped += 1;
              await transferProgress(item.metadata.name ?? item.metadata.id);
              continue;
            }
            const assigned = (item.metadata.folders ?? [])
              .map((id) => folders.mapped.get(id))
              .filter((id): id is string => Boolean(id));
            const result = await dependencies.importItem(item, assigned);
            if (!result.ok || !result.id) {
              if (result.id) importedIds.push(result.id);
              throw new Error(
                result.error || "An Eagle package Save could not be imported.",
              );
            }
            if (result.skipped) skipped += 1;
            else {
              imported += 1;
              importedIds.push(result.id);
            }
            await transferProgress(item.metadata.name ?? item.metadata.id);
          }
          checkTransferCancellation();
          return { imported, skipped };
        } catch (error) {
          await dependencies.rollback(importedIds, folders.createdIds);
          throw error;
        }
      } finally {
        await prepared.cleanup();
      }
    },
  );
  const settled = operation.then(
    () => {},
    () => {},
  );
  imports.set(dependencies, settled);
  try {
    return await operation;
  } finally {
    if (imports.get(dependencies) === settled) imports.delete(dependencies);
  }
}

interface NestedEagleFolder extends Omit<EagleFolder, "children"> {
  children: NestedEagleFolder[];
}

function nestedFolders(
  folders: readonly EaglePackageFolder[],
): NestedEagleFolder[] {
  const included = new Map(
    folders.map((folder): [string, NestedEagleFolder] => [
      folder.id,
      {
        id: folder.id,
        name: folder.name,
        color: folder.color ?? null,
        children: [],
      },
    ]),
  );
  const roots: NestedEagleFolder[] = [];
  for (const folder of [...folders].sort(
    (left, right) =>
      (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
      left.name.localeCompare(right.name),
  )) {
    const node = included.get(folder.id);
    if (!node) continue;
    const parent = folder.parentId ? included.get(folder.parentId) : undefined;
    if (parent) {
      parent.children ??= [];
      parent.children.push(node);
    } else roots.push(node);
  }
  return roots;
}

function extensionWithoutDot(path: string): string {
  return extname(path).replace(/^\./, "").toLowerCase();
}

function eagleMetadata(item: EaglePackageExportItem): EagleItem {
  const originals = item.save.files.filter(
    (file) => !isAuxiliaryKind(file.kind),
  );
  const primary = originals[0];
  return {
    id: item.save.id,
    name:
      item.save.title?.trim() ||
      (primary ? basename(primary.path, extname(primary.path)) : item.save.id),
    size: originals.reduce((total, file) => total + file.size, 0),
    btime: item.save.createdAt?.getTime(),
    mtime: item.save.savedAt?.getTime(),
    ext: primary ? extensionWithoutDot(primary.path) : "",
    tags: item.save.tags,
    folders: [...new Set(item.folderIds)],
    isDeleted: false,
    url: item.save.url,
    annotation: item.save.notes ?? "",
    modificationTime: item.save.savedAt?.getTime(),
    width: item.save.width ?? undefined,
    height: item.save.height ?? undefined,
    star: item.save.rating ?? undefined,
    palettes: item.save.dominantColors ?? [],
  };
}

async function exportDirectory(
  input: EaglePackageExportInput,
  destination: string,
): Promise<{ exported: number }> {
  const root = await realpath(destination);
  if (input.items.length === 0) throw new Error("Select Saves to export.");
  const folders = input.folders ?? [];
  const folderIds = new Set(folders.map((folder) => folder.id));
  const roots = nestedFolders(folders);
  if (roots.length > 1)
    throw new Error("An Eagle package can contain only one root folder.");
  const ids = new Set<string>();
  const metadata: EagleItem[] = [];
  let exported = 0;
  await transferPhase("Exporting Eagle package", input.items.length);
  for (const item of input.items) {
    checkTransferCancellation();
    if (ids.has(item.save.id))
      throw new Error("The Eagle package selection contains duplicate Saves.");
    ids.add(item.save.id);
    if (item.folderIds.some((id) => !folderIds.has(id)))
      throw new Error("The Eagle package references a missing folder.");
    const sourceRoot = await realpath(item.directory);
    const directory = targetFor(root, `${safeSegment(item.save.id)}.info`);
    await mkdir(directory, { recursive: false });
    const used = new Set<string>(["metadata.json"]);
    const originals = item.save.files.filter(
      (file) => !isAuxiliaryKind(file.kind),
    );
    for (const file of originals) {
      const source = await realpath(resolve(sourceRoot, file.path));
      if (!source.startsWith(`${sourceRoot}${sep}`))
        throw new Error("An Eagle package original resolves outside its Save.");
      const filename = uniqueName(basename(file.path), used);
      await exportLibraryMedia(source, join(directory, filename));
      exported += 1;
    }
    const thumbnail = item.save.files.find((file) =>
      isThumbnailKind(file.kind),
    );
    if (thumbnail) {
      const source = await realpath(resolve(sourceRoot, thumbnail.path));
      if (!source.startsWith(`${sourceRoot}${sep}`))
        throw new Error(
          "An Eagle package thumbnail resolves outside its Save.",
        );
      const primaryName = originals[0]
        ? basename(originals[0].path)
        : safeSegment(item.save.id);
      const filename = uniqueName(`${primaryName}_thumbnail.png`, used);
      const png = await sharp(await readLibraryMedia(source), { pages: 1 })
        .png()
        .toBuffer();
      await writeFile(join(directory, filename), png, {
        flag: "wx",
        mode: 0o600,
      });
      exported += 1;
    }
    const itemMetadata = eagleMetadata(item);
    metadata.push(itemMetadata);
    await writeFile(
      join(directory, "metadata.json"),
      `${JSON.stringify(itemMetadata, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await transferProgress(item.save.title ?? item.save.id);
  }
  const pack = roots[0]
    ? { images: metadata, folder: roots[0] }
    : { images: metadata };
  await writeFile(
    join(root, "pack.json"),
    `${JSON.stringify(pack, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  return { exported };
}

function uniqueName(requested: string, used: Set<string>): string {
  const safe = safeSegment(requested);
  const extension = extname(safe);
  const stem = basename(safe, extension);
  let candidate = safe;
  let suffix = 1;
  while (used.has(candidate.toLocaleLowerCase("en-US"))) {
    candidate = `${stem}-${suffix++}${extension}`;
  }
  used.add(candidate.toLocaleLowerCase("en-US"));
  return candidate;
}

async function zipDirectory(
  directory: string,
  destination: string,
): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const files = await scanDirectory(directory, DEFAULT_LIMITS);
  for (const file of files)
    zip.file(file.path, createReadStream(file.absolutePath), {
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      createFolders: true,
      unixPermissions: 0o100600,
    });
  await pipeline(
    zip.generateNodeStream({
      type: "nodebuffer",
      streamFiles: true,
      platform: "UNIX",
    }),
    createWriteStream(destination, { flags: "wx", mode: 0o600 }),
  );
}

async function exportPackage(
  input: EaglePackageExportInput,
  destination: string,
) {
  const parent = await realpath(dirname(resolve(destination)));
  const staging = await mkdtemp(join(parent, ".eagle-package-"));
  const archive = join(parent, `.eagle-package-${ulid()}.tmp`);
  try {
    const result = await exportDirectory(input, staging);
    await parsePackage(staging, DEFAULT_LIMITS);
    await zipDirectory(staging, archive);
    await copyFile(archive, destination, constants.COPYFILE_EXCL);
    return { path: destination, exported: result.exported };
  } finally {
    await Promise.all([
      rm(staging, { recursive: true, force: true }),
      rm(archive, { force: true }),
    ]);
  }
}

export function exportEaglePackage(
  input: EaglePackageExportInput,
  destination: string,
) {
  return runLibraryTransfer(() => exportPackage(input, destination));
}

export function importEaglePackage(
  source: string,
  dependencies: EaglePackageImportRuntime = runtime,
  limits: Partial<EaglePackageLimits> = {},
) {
  return runLibraryTransfer(() =>
    importPackage(source, dependencies, resolvedLimits(limits)),
  );
}
