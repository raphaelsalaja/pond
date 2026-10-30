import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import type { Folder, Save } from "@pond/schema/db";
import { isAuxiliaryKind } from "@shared/save-file-names";
import { z } from "zod";
import { readBundleJson } from "../lib/library-config";
import type { PackageOrganization } from "./package-organization";
import { exportLibraryMedia } from "./storage/library-media-storage";
import {
  checkTransferCancellation,
  recordTransferCopy,
  transferCopyCheckpoint,
  transferPhase,
  transferProgress,
} from "./transfer-jobs";

type ExportSave = Pick<
  Save,
  "id" | "title" | "url" | "tags" | "notes" | "files"
> &
  Partial<
    Pick<
      Save,
      | "source"
      | "sourceId"
      | "importedFrom"
      | "width"
      | "height"
      | "dominantColors"
      | "publishedAt"
      | "coverIndex"
      | "mediaType"
      | "rotate"
      | "flipX"
      | "flipY"
      | "crop"
      | "lang"
      | "siteName"
      | "rawJson"
      | "caption"
      | "captionModel"
      | "ocrText"
      | "ocrModel"
      | "transcript"
      | "transcriptModel"
      | "author"
      | "description"
      | "rating"
      | "savedAt"
      | "createdAt"
    >
  >;
type ExportFolder = Pick<Folder, "id" | "name" | "parentId"> &
  Partial<Pick<Folder, "color" | "sortOrder">>;

export interface ExportItem {
  save: ExportSave;
  directory: string;
  folderIds: string[];
}

function safeName(value: string): string {
  const cleaned = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? "_" : character,
  )
    .join("")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim();
  const name = cleaned.replace(/^\.+$|[. ]+$/g, "").slice(0, 120) || "Untitled";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    ? `_${name}`
    : name;
}

function isCollision(error: Error): boolean {
  return "code" in error && error.code === "EEXIST";
}

const destinationQueues = new Map<string, Promise<void>>();

async function reserveOutput(
  directory: string,
  filename: string,
  write: (path: string) => Promise<void>,
): Promise<string> {
  const root = await realpath(directory);
  const prior = destinationQueues.get(root) ?? Promise.resolve();
  let release = () => {};
  const pending = new Promise<void>((done) => {
    release = done;
  });
  const tail = prior.then(() => pending);
  destinationQueues.set(root, tail);
  await prior;
  try {
    const used = new Set(
      (await readdir(root)).map((name) => name.toLowerCase()),
    );
    const cleaned = safeName(filename);
    const extension = extname(cleaned);
    const stem = basename(cleaned, extension);
    let suffix = 0;
    for (;;) {
      const name = suffix === 0 ? cleaned : `${stem}-${suffix}${extension}`;
      suffix += 1;
      if (used.has(name.toLowerCase())) continue;
      const path = join(root, name);
      try {
        await write(path);
        return path;
      } catch (error) {
        if (!(error instanceof Error) || !isCollision(error)) throw error;
        used.add(name.toLowerCase());
      }
    }
  } finally {
    release();
    if (destinationQueues.get(root) === tail) destinationQueues.delete(root);
  }
}

export async function copyExportFile(
  source: string,
  directory: string,
  filename: string,
) {
  return reserveOutput(directory, filename, (path) =>
    exportLibraryMedia(source, path),
  );
}

export async function writeExportFile(
  directory: string,
  filename: string,
  contents: string | Buffer,
) {
  return reserveOutput(directory, filename, (path) =>
    writeFile(path, contents, { flag: "wx" }),
  );
}

function folderPaths(folders: readonly ExportFolder[]): Map<string, string[]> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names = new Map<string, string>();
  const siblings = new Map<string | null, Set<string>>();
  for (const folder of [...folders].sort((a, b) => a.id.localeCompare(b.id))) {
    const used = siblings.get(folder.parentId) ?? new Set<string>();
    const base = safeName(folder.name);
    let name = base;
    let suffix = 1;
    while (used.has(name.toLowerCase())) name = `${base}-${suffix++}`;
    used.add(name.toLowerCase());
    siblings.set(folder.parentId, used);
    names.set(folder.id, name);
  }
  const paths = new Map<string, string[]>();
  for (const folder of folders) {
    const parts: string[] = [];
    const visited = new Set<string>();
    let current: ExportFolder | undefined = folder;
    while (current) {
      if (visited.has(current.id))
        throw new Error("Cannot export a folder cycle.");
      visited.add(current.id);
      parts.unshift(names.get(current.id) ?? "Untitled");
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    paths.set(folder.id, parts);
  }
  return paths;
}

async function exportDirectory(root: string, parts: readonly string[]) {
  let directory = root;
  for (const part of parts) {
    directory = join(directory, part);
    await mkdir(directory, { recursive: true });
    const actual = await realpath(directory);
    if (actual !== root && !actual.startsWith(`${root}${sep}`)) {
      throw new Error("Export folder resolves outside the chosen directory.");
    }
    directory = actual;
  }
  return directory;
}

export async function exportFiles(input: {
  directory: string;
  items: readonly ExportItem[];
  folders?: readonly ExportFolder[];
  includeDerived?: boolean;
  organization?: PackageOrganization;
}) {
  const root = await realpath(input.directory);
  const folders = input.folders ?? [];
  const paths = folderPaths(folders);
  const exportedFiles: Array<{
    saveId: string;
    sourcePath: string;
    path: string;
  }> = [];
  await transferPhase(
    "Exporting originals",
    input.items.reduce(
      (total, item) =>
        total +
        item.save.files.filter(
          (file) => input.includeDerived || !isAuxiliaryKind(file.kind),
        ).length *
          Math.max(1, new Set(item.folderIds).size),
      0,
    ),
  );
  for (const item of input.items) {
    const sourceRoot = await realpath(item.directory);
    const originals = item.save.files.filter(
      (file) => input.includeDerived || !isAuxiliaryKind(file.kind),
    );
    const destinations = [...new Set(item.folderIds)].map((id) => {
      const parts = paths.get(id);
      if (!parts) throw new Error(`Cannot export missing folder ${id}.`);
      return parts;
    });
    if (destinations.length === 0) destinations.push([]);
    for (const parts of destinations) {
      const directory = await exportDirectory(root, parts);
      for (const [index, file] of originals.entries()) {
        checkTransferCancellation();
        const source = await realpath(resolve(sourceRoot, file.path));
        if (!source.startsWith(`${sourceRoot}${sep}`))
          throw new Error("Original file resolves outside its Save.");
        const extension = extname(file.path);
        const title = safeName(item.save.title || item.save.id);
        const name =
          originals.length === 1
            ? `${title}${extension}`
            : `${title}-${index + 1}${extension}`;
        const key = JSON.stringify([
          root,
          item.save.id,
          file.path,
          parts,
          file.sha256,
          file.size,
        ]);
        const checkpoint = transferCopyCheckpoint(key);
        const reusable =
          checkpoint &&
          checkpoint.sha256 === file.sha256 &&
          (await verifiedCheckpoint(
            checkpoint.path,
            directory,
            file.size,
            file.sha256,
          ));
        const path = reusable
          ? checkpoint.path
          : await copyExportFile(source, directory, name);
        if (!reusable)
          await recordTransferCopy({
            key,
            path,
            size: file.size,
            sha256: file.sha256,
          });
        await transferProgress(path, file.size);
        exportedFiles.push({
          saveId: item.save.id,
          sourcePath: file.path,
          path: relative(root, path).split(sep).join("/"),
        });
      }
    }
  }
  checkTransferCancellation();
  const manifest = await writeExportFile(
    root,
    "pond-export.json",
    JSON.stringify(
      {
        version: 1,
        organization: input.organization,
        folders,
        saves: await Promise.all(
          input.items.map(async ({ save, folderIds, directory }) => ({
            userTitleLocked: input.includeDerived
              ? await hasUserTitle(directory)
              : undefined,
            id: save.id,
            title: save.title,
            url: save.url,
            tags: save.tags,
            notes: save.notes,
            source: save.source,
            sourceId: save.sourceId,
            importedFrom: save.importedFrom ?? undefined,
            width: save.width,
            height: save.height,
            dominantColors: save.dominantColors,
            publishedAt: save.publishedAt,
            coverIndex: save.coverIndex,
            mediaType: save.mediaType,
            rotate: save.rotate,
            flipX: save.flipX,
            flipY: save.flipY,
            crop: save.crop,
            lang: input.includeDerived ? save.lang : undefined,
            siteName: input.includeDerived ? save.siteName : undefined,
            rawJson: input.includeDerived ? save.rawJson : undefined,
            caption: input.includeDerived ? save.caption : undefined,
            captionModel: input.includeDerived ? save.captionModel : undefined,
            ocrText: input.includeDerived ? save.ocrText : undefined,
            ocrModel: input.includeDerived ? save.ocrModel : undefined,
            transcript: input.includeDerived ? save.transcript : undefined,
            transcriptModel: input.includeDerived
              ? save.transcriptModel
              : undefined,

            author: save.author,
            description: save.description,
            rating: save.rating,
            savedAt: save.savedAt,
            createdAt: save.createdAt,
            files: save.files,
            folderIds,
          })),
        ),
        exportedFiles,
      },
      null,
      2,
    ),
  );
  return { exported: exportedFiles.length, manifest };
}

async function hasUserTitle(directory: string): Promise<boolean> {
  const value = readBundleJson<{ locked: boolean }>(
    join(directory, "user-title.json"),
  );
  return value
    ? z.object({ locked: z.boolean() }).parse(value.data).locked
    : false;
}

async function verifiedCheckpoint(
  path: string,
  directory: string,
  size: number,
  sha256: string,
): Promise<boolean> {
  const actual = await realpath(path).catch(() => null);
  if (!actual?.startsWith(`${directory}${sep}`)) return false;
  const file = await stat(actual);
  if (!file.isFile() || file.size !== size) return false;
  if (!sha256) return false;
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(actual)) {
    checkTransferCancellation();
    hash.update(bytes);
  }
  return hash.digest("hex") === sha256;
}
