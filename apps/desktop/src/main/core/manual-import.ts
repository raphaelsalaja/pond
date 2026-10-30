import { open, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type MediaType,
  type NewSave,
  type Save,
  type SaveFile,
  type Source,
  saves,
} from "@pond/schema/db";
import type { ImportOrigin } from "@pond/schema/import-origin";
import {
  classifyLibraryFileFromHeader,
  type LibraryFileFormat,
  libraryFilename,
} from "@shared/file-format";
import { isAuxiliaryKind, THUMBNAIL_KIND } from "@shared/save-file-names";
import type {
  ImportFileFailure,
  ManualSaveResult,
} from "@shared/saves-import-contracts";
import { and, eq } from "drizzle-orm";
import mime from "mime-types";
import { ulid } from "ulid";
import { getDb } from "../db";
import { writeSaveInfo } from "../lib/library";
import { saveDir } from "../paths";
import { executeBatch, withMutationScope } from "./executor";
import { extractFontMetadata, metadataFromOpenType } from "./font-metadata";
import { extractImageMetadata, type ImageMetadata } from "./image-metadata";
import { extractMediaMetadata } from "./media-metadata";
import { persistSave } from "./persist-save";
import type { WriteFileArgs } from "./pipeline/workers/apply";
import { ensureSaveThumbnail } from "./save-thumbnail";
import { libraryMediaMetadata } from "./storage/library-media-storage";
import { normalizeTagList, prepareTagRegistryUpdates } from "./tags";

const MAX_TEXT_BODY_BYTES = 100_000;
const FORMAT_HEADER_BYTES = 188 * 3;

export interface ManualSaveInput {
  title?: string | null;
  url?: string | null;
  note?: string | null;
  tags?: string[];
  filePaths?: string[];
  memoryFiles?: ManualSaveMemoryFile[];
  fileSourceUrls?: string[];
  /** Optional preview supplied by an external library such as Eagle. */
  thumbnailPath?: string | null;
  sourceId?: string | null;
  source?: Source;
  importedFrom?: ImportOrigin;
  savedAt?: Date;
  createdAt?: Date;
  publishedAt?: Date;
  width?: number;
  height?: number;
  rating?: number | null;
  dominantColors?: string[];
  mediaType?: MediaType | null;
}

export interface ManualSaveMemoryFile {
  bytes: Buffer;
  filename: string;
  mimeType: string;
}

interface ReadableImport {
  filename: string;
  size: number;
  format: LibraryFileFormat;
  source: { path: string } | { bytes: Buffer };
  body?: string;
  width?: number;
  height?: number;
  keywords?: string[];
  metadata?: ImageMetadata;
}

const MEDIA_TYPE_PRIORITY: readonly MediaType[] = [
  "image",
  "video",
  "audio",
  "document",
  "font",
  "text",
  "file",
];
const MAX_IPTC_BYTES = 2 * 1024 * 1024;

export function extractIptcKeywords(bytes: Buffer): string[] {
  const keywords: string[] = [];
  for (let offset = 0; offset <= bytes.length - 5; offset += 1) {
    if (
      bytes[offset] !== 0x1c ||
      bytes[offset + 1] !== 0x02 ||
      bytes[offset + 2] !== 0x19
    )
      continue;
    const length = bytes.readUInt16BE(offset + 3);
    if ((length & 0x8000) !== 0) continue;
    const start = offset + 5;
    const end = start + length;
    if (end > bytes.length) continue;
    const value = bytes.subarray(start, end);
    let keyword: string;
    try {
      keyword = new TextDecoder("utf-8", { fatal: true }).decode(value);
    } catch {
      keyword = value.toString("latin1");
    }
    const normalized = keyword.trim();
    if (normalized) keywords.push(normalized);
    offset = end - 1;
  }
  return [...new Set(keywords)];
}

export function mediaTypeForImportedFiles(
  formats: readonly LibraryFileFormat[],
): MediaType | null {
  if (formats.length === 0) return null;
  const counts = new Map<MediaType, number>();
  for (const item of formats) {
    counts.set(item.mediaType, (counts.get(item.mediaType) ?? 0) + 1);
  }
  let selected: MediaType = formats[0]?.mediaType ?? "file";
  let selectedCount = counts.get(selected) ?? 0;
  for (const candidate of MEDIA_TYPE_PRIORITY) {
    const count = counts.get(candidate) ?? 0;
    if (count > selectedCount) {
      selected = candidate;
      selectedCount = count;
    } else if (
      count === selectedCount &&
      count > 0 &&
      MEDIA_TYPE_PRIORITY.indexOf(candidate) <
        MEDIA_TYPE_PRIORITY.indexOf(selected)
    ) {
      selected = candidate;
    }
  }
  return selected;
}

export function classifyManualSave(input: {
  hasFiles: boolean;
  hasUrl: boolean;
  onlyTextFiles: boolean;
  title: string | null;
  textBody: string | null;
  mediaType?: MediaType | null;
  importedType: MediaType | null;
}):
  | { ok: false; error: "empty_input" }
  | { ok: true; isTextSave: boolean; mediaType: MediaType } {
  const forcedText = input.mediaType === "text";
  const isTextSave =
    !input.hasUrl &&
    (forcedText ||
      input.onlyTextFiles ||
      (!input.hasFiles && Boolean(input.textBody)));
  if (
    !input.hasFiles &&
    !input.title &&
    !input.textBody &&
    !input.hasUrl &&
    !forcedText
  ) {
    return { ok: false, error: "empty_input" };
  }
  return {
    ok: true,
    isTextSave,
    mediaType:
      input.importedType ?? (isTextSave ? "text" : (input.mediaType ?? "link")),
  };
}

export function storageKindForImport(
  format: LibraryFileFormat,
): SaveFile["kind"] {
  switch (format.mediaType) {
    case "image":
      if (format.previewKind === "generic") return "file";
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "document":
      return "document";
    case "font":
      return "font";
    case "text":
      return "text_file";
    default:
      return "file";
  }
}

export async function createManualSave(
  input: ManualSaveInput,
): Promise<ManualSaveResult> {
  return withMutationScope(() => importManualSave(input));
}

async function importManualSave(
  input: ManualSaveInput,
): Promise<ManualSaveResult> {
  const db = await getDb();
  let id = ulid();
  let recovering = false;
  const source = input.source ?? "local";
  const overrideId = input.sourceId?.trim() || null;
  const sourceId = overrideId || id;
  const now = new Date();
  const requestedFileCount =
    (input.filePaths?.length ?? 0) + (input.memoryFiles?.length ?? 0);

  if (overrideId) {
    const existing = db
      .select()
      .from(saves)
      .where(and(eq(saves.source, source), eq(saves.sourceId, sourceId)))
      .all()[0];
    if (existing) {
      if (
        existing.deletedAt ||
        requestedFileCount === 0 ||
        (await importedFilesComplete(
          existing,
          saveDir(existing.id),
          requestedFileCount,
        ))
      )
        return { ok: true, id: existing.id, skipped: true };
      id = existing.id;
      recovering = true;
    }
  }

  const note = input.note?.trim() || null;
  const inspected = await inspectImportPaths(input.filePaths ?? []);
  const failedFiles = inspected.failures.length
    ? inspected.failures
    : undefined;
  const readable = [
    ...inspected.items,
    ...(await inspectMemoryFiles(input.memoryFiles ?? [])),
  ];
  const tags = normalizeTagList([
    ...(input.tags ?? []),
    ...readable.flatMap((item) => item.keywords ?? []),
  ]);

  if (requestedFileCount > 0 && readable.length === 0) {
    return { ok: false, error: "no_readable_files", failedFiles };
  }

  const title =
    input.title?.trim() ||
    (readable[0]
      ? basename(readable[0].filename, `.${readable[0].format.extension}`)
      : null);

  const importedText = readable
    .filter((item) => item.format.mediaType === "text")
    .map((item) => item.body?.trim())
    .filter((body): body is string => Boolean(body))
    .join("\n\n")
    .trim();

  const hasFiles = readable.length > 0;
  const hasUrl = Boolean(input.url?.trim());
  const customThumbnail = input.thumbnailPath
    ? await inspectCustomThumbnail(input.thumbnailPath)
    : null;
  const storesFiles = hasFiles || Boolean(customThumbnail);
  const onlyTextFiles =
    hasFiles && readable.every((item) => item.format.mediaType === "text");
  const textBody = (importedText || note)?.trim() || null;
  const classified = classifyManualSave({
    hasFiles,
    hasUrl,
    onlyTextFiles,
    title,
    textBody,
    mediaType: input.mediaType,
    importedType: mediaTypeForImportedFiles(
      readable.map((item) => item.format),
    ),
  });
  if (!classified.ok) return { ok: false, error: classified.error };

  const { isTextSave, mediaType } = classified;

  const insertValues: NewSave = {
    id,
    source,
    sourceId,
    importedFrom: input.importedFrom ?? null,
    url: input.url?.trim() || `pond:local/${id}`,
    title,
    description: isTextSave ? textBody : null,
    notes: isTextSave ? null : note,
    mediaType,
    siteName: null,
    status: storesFiles ? "ingesting" : "complete",
    tags,
    listKinds: ["saved"],
    files: [],
    coverIndex: 0,
    ingestStartedAt: now,
    ingestCompletedAt: storesFiles ? null : now,
    savedAt: input.savedAt ?? now,
    createdAt: input.createdAt ?? now,
    publishedAt: input.publishedAt,
  };
  if (input.width != null) insertValues.width = input.width;
  if (input.height != null) insertValues.height = input.height;
  if (input.rating != null) insertValues.rating = input.rating;
  if (input.dominantColors) insertValues.dominantColors = input.dominantColors;
  const primaryMetadata = readable[0]?.metadata;
  if (primaryMetadata) Object.assign(insertValues, primaryMetadata);
  if (!insertValues.container && readable[0])
    insertValues.container = readable[0].format.extension;
  if (readable.length > 0) insertValues.metadataVersion = 1;
  const registry = await prepareTagRegistryUpdates(tags);
  if (!recovering) {
    await executeBatch([
      ...registry,
      {
        kind: "create",
        model: "save",
        id,
        data: insertValues,
        meta: { actor: "user", actorReason: "manual:create" },
      },
    ]);
  } else if (registry.length) {
    await executeBatch(registry);
  }

  if (storesFiles) {
    const newFiles: WriteFileArgs[] = readable.map((item) => {
      const kind = storageKindForImport(item.format);
      const metadata = {
        kind,
        filename: item.filename,
        sourceUrl:
          "path" in item.source
            ? input.fileSourceUrls?.[
                input.filePaths?.indexOf(item.source.path) ?? -1
              ]
            : undefined,
        mimeType: item.format.mimeType,
        width: item.width,
        height: item.height,
      };
      return "path" in item.source
        ? { ...metadata, sourcePath: item.source.path }
        : { ...metadata, bytes: item.source.bytes };
    });

    if (customThumbnail) {
      const metadata = {
        kind: THUMBNAIL_KIND,
        filename: customThumbnail.filename,
        mimeType: customThumbnail.format.mimeType,
        width: customThumbnail.width,
        height: customThumbnail.height,
        custom: true,
      };
      newFiles.push(
        "path" in customThumbnail.source
          ? { ...metadata, sourcePath: customThumbnail.source.path }
          : { ...metadata, bytes: customThumbnail.source.bytes },
      );
    }

    const fileSize = readable.reduce((sum, item) => sum + item.size, 0);
    const completed = await persistSave(
      id,
      { status: "complete", ingestCompletedAt: new Date(), fileSize },
      {
        actorReason: "manual:import",
        newFiles,
        replaceFilesWithKind: recovering
          ? [...new Set(newFiles.map((file) => file.kind))]
          : undefined,
      },
    );
    if (
      !completed ||
      !(await importedFilesComplete(completed, saveDir(id), readable.length))
    ) {
      await persistSave(
        id,
        { status: "failed", ingestCompletedAt: null },
        { actorReason: "manual:import-incomplete" },
      );
      return { ok: false, error: "incomplete_import" };
    }
    const font = readable.find((item) => item.format.mediaType === "font");
    if (font) {
      const metadata =
        "path" in font.source
          ? await extractFontMetadata(font.source.path)
          : metadataFromOpenType(font.source.bytes);
      if (metadata) {
        const style = metadata.subfamily?.toLocaleLowerCase() ?? "";
        const automaticTags = [
          ...(style.includes("bold") || (metadata.weight ?? 0) >= 700
            ? ["Bold"]
            : []),
          ...(style.includes("italic") || style.includes("oblique")
            ? ["Italic"]
            : []),
        ];
        const nextTags = normalizeTagList([...tags, ...automaticTags]);
        const fontRegistry = await prepareTagRegistryUpdates(nextTags);
        if (fontRegistry.length) await executeBatch(fontRegistry);
        const files = completed.files.map((file, index) =>
          index === 0
            ? {
                ...file,
                family: metadata.family,
                subfamily: metadata.subfamily,
                fontWeight: metadata.weight,
              }
            : file,
        );
        const patch = input.title?.trim()
          ? { files, tags: nextTags }
          : { files, tags: nextTags, title: metadata.family ?? title };
        await persistSave(id, patch, { actorReason: "manual:font-family" });
      }
    }
    await ensureSaveThumbnail(id, completed);
  } else {
    const finalRow = (await db.select().from(saves).where(eq(saves.id, id)))[0];
    if (finalRow) await writeSaveInfo(finalRow);
  }

  return { ok: true, id, failedFiles };
}

async function inspectImportPaths(paths: readonly string[]): Promise<{
  items: ReadableImport[];
  failures: ImportFileFailure[];
}> {
  const out: ReadableImport[] = [];
  const failures: ImportFileFailure[] = [];
  for (const path of paths) {
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size === 0) continue;
      const detectedMime = mime.lookup(path) || null;
      const format = classifyLibraryFileFromHeader(
        path,
        detectedMime,
        await readFilePrefix(path, Math.min(info.size, FORMAT_HEADER_BYTES)),
      );
      const item: ReadableImport = {
        filename: libraryFilename(path),
        size: info.size,
        format,
        source: { path },
      };
      if (format.mediaType === "text") {
        item.body = await readTextBody(path, info.size);
      }
      if (format.mediaType === "image") {
        item.metadata = await extractImageMetadata(path);
        if (item.metadata.width) item.width = item.metadata.width;
        if (item.metadata.height) item.height = item.metadata.height;
        item.keywords = await readIptcKeywords(path, info.size);
      }
      if (format.mediaType === "video" || format.mediaType === "audio")
        item.metadata = await extractMediaMetadata(path);
      out.push(item);
    } catch (err) {
      failures.push({
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { items: out, failures };
}

async function inspectMemoryFiles(
  files: readonly ManualSaveMemoryFile[],
): Promise<ReadableImport[]> {
  const out: ReadableImport[] = [];
  for (const file of files) {
    if (file.bytes.byteLength === 0) continue;
    const format = classifyLibraryFileFromHeader(
      file.filename,
      file.mimeType,
      file.bytes.subarray(0, FORMAT_HEADER_BYTES),
    );
    const item: ReadableImport = {
      filename: libraryFilename(file.filename),
      size: file.bytes.byteLength,
      format,
      source: { bytes: file.bytes },
    };
    if (format.mediaType === "image") {
      item.metadata = await extractImageMetadata(file.bytes);
      if (item.metadata.width) item.width = item.metadata.width;
      if (item.metadata.height) item.height = item.metadata.height;
      item.keywords = extractIptcKeywords(
        file.bytes.subarray(0, MAX_IPTC_BYTES),
      );
    }
    out.push(item);
  }
  return out;
}

async function readIptcKeywords(path: string, size: number): Promise<string[]> {
  const length = Math.min(size, MAX_IPTC_BYTES);
  const buffer = Buffer.alloc(length);
  const handle = await open(path, "r");
  try {
    await handle.read(buffer, 0, length, 0);
  } finally {
    await handle.close();
  }
  return extractIptcKeywords(buffer);
}

async function readFilePrefix(path: string, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const handle = await open(path, "r");
  try {
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function inspectCustomThumbnail(
  path: string,
): Promise<ReadableImport | null> {
  const { items } = await inspectImportPaths([path]);
  const item = items[0];
  return item?.format.mediaType === "image" ? item : null;
}

async function readTextBody(path: string, size: number): Promise<string> {
  const length = Math.min(size, MAX_TEXT_BODY_BYTES);
  const buffer = Buffer.alloc(length);
  const handle = await open(path, "r");
  try {
    await handle.read(buffer, 0, length, 0);
  } finally {
    await handle.close();
  }
  return buffer.toString("utf8");
}

export async function importedFilesComplete(
  save: Pick<Save, "status" | "files">,
  directory: string,
  expected: number,
): Promise<boolean> {
  const originals = (save.files ?? []).filter(
    (file) => !isAuxiliaryKind(file.kind),
  );
  if (save.status !== "complete" || originals.length < expected) return false;
  for (const file of originals) {
    const actual = await libraryMediaMetadata(join(directory, file.path)).catch(
      () => null,
    );
    if (!actual || actual.originalSize !== file.size) return false;
  }
  return true;
}
