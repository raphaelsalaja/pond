import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { MEDIA_TYPES, type NewSave, SOURCES, saves } from "@pond/schema/db";
import { IMPORT_ORIGINS } from "@pond/schema/import-origin";
import { StoredRawJsonSchema, storedAsRawJson } from "@pond/schema/raw-schema";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { getDb } from "../db";
import { writeBundleJson } from "../lib/library-config";
import { saveDir } from "../paths";
import { writeEnrichmentSidecar } from "./enrichment-sidecar";
import { executeBatch, withMutationScope } from "./executor";
import { exportSavesToDirectory } from "./export-saves";
import { importFolderTree, setSaveFolders } from "./folders";
import { runLibraryTransfer } from "./library-transfers";
import {
  importPackageOrganization,
  type PackageOrganization,
  PackageOrganizationSchema,
  validatePackageOrganization,
} from "./package-organization";
import { readSave } from "./pipeline/workers/apply";
import {
  copyLibraryMediaFile,
  libraryMediaMetadata,
  readLibraryMediaRange,
} from "./storage/library-media-storage";
import { prepareTagRegistryUpdates } from "./tags";
import {
  checkTransferCancellation,
  transferPhase,
  transferProgress,
} from "./transfer-jobs";

const PackageSaveSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  userTitleLocked: z.boolean().optional(),
  url: z.string(),
  source: z.enum(SOURCES).optional(),
  sourceId: z.string().optional(),
  importedFrom: z.enum(IMPORT_ORIGINS).optional().catch(undefined),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  rawJson: StoredRawJsonSchema.nullable().optional(),
  lang: z.string().nullable().optional(),
  siteName: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  captionModel: z.string().nullable().optional(),
  ocrText: z.string().nullable().optional(),
  ocrModel: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  transcriptModel: z.string().nullable().optional(),

  description: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  dominantColors: z.array(z.string()).optional(),
  primaryColor: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  coverIndex: z.number().optional(),
  mediaType: z.enum(MEDIA_TYPES).nullable().optional(),
  rotate: z.number().optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  crop: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .nullable()
    .optional(),
  savedAt: z.iso.datetime().nullable().optional(),
  createdAt: z.iso.datetime().nullable().optional(),
  publishedAt: z.iso.datetime().nullable().optional(),
  folderIds: z.array(z.string()),
  files: z.array(
    z.object({
      path: z.string(),
      kind: z.string(),
      size: z.number(),
      sha256: z.string(),
      mimeType: z.string().nullable().optional(),
      width: z.number().nullable().optional(),
      height: z.number().nullable().optional(),
      sourceUrl: z.string().nullable().optional(),
    }),
  ),
});
const PackageSchema = z.object({
  version: z.literal(1),
  organization: PackageOrganizationSchema.optional(),
  saves: z.array(PackageSaveSchema),
  folders: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      parentId: z.string().nullable(),
      color: z.string().nullable().optional(),
      sortOrder: z.number().optional(),
    }),
  ),
  exportedFiles: z.array(
    z.object({ saveId: z.string(), sourcePath: z.string(), path: z.string() }),
  ),
});
type PackageSave = z.infer<typeof PackageSaveSchema>;
interface PackageImportRuntime {
  organization?: (
    data: PackageOrganization,
    folders: ReadonlyMap<string, string>,
    saves: ReadonlyMap<string, string>,
  ) => Promise<void>;
  folders: typeof importFolderTree;
  existing: (save: PackageSave) => Promise<string | null>;
  directory: (id: string) => string;
  commit: (id: string, save: PackageSave, folderIds: string[]) => Promise<void>;
}
const runtime: PackageImportRuntime = {
  organization: importPackageOrganization,
  folders: (nodes) => withMutationScope(() => importFolderTree(nodes, true)),
  directory: saveDir,
  async existing(save) {
    const db = await getDb();
    const [existing] = await db
      .select({ id: saves.id })
      .from(saves)
      .where(
        and(
          eq(saves.source, save.source ?? "local"),
          eq(saves.sourceId, save.sourceId || `pondpack:${save.id}`),
        ),
      );
    return existing?.id ?? null;
  },
  async commit(id, save, folderIds) {
    return withMutationScope(async () => {
      const data: NewSave = {
        id,
        source: save.source ?? "local",
        sourceId: save.sourceId || `pondpack:${save.id}`,
        importedFrom: save.importedFrom ?? "pond-package",
        url: save.url,
        title: save.title,
        notes: save.notes,
        rawJson: save.rawJson ? storedAsRawJson(save.rawJson) : null,
        lang: save.lang,
        siteName: save.siteName,
        caption: save.caption,
        captionModel: save.captionModel,
        ocrText: save.ocrText,
        ocrModel: save.ocrModel,
        transcript: save.transcript,
        transcriptModel: save.transcriptModel,

        description: save.description,
        author: save.author,
        tags: save.tags,
        rating: save.rating,
        dominantColors: save.dominantColors,
        primaryColor: save.primaryColor,
        width: save.width,
        height: save.height,
        mediaType: save.mediaType,
        coverIndex: save.coverIndex,
        rotate: save.rotate,
        flipX: save.flipX,
        flipY: save.flipY,
        crop: save.crop,
        files: save.files,
        fileSize: save.files.reduce((size, file) => size + file.size, 0),
        savedAt: save.savedAt ? new Date(save.savedAt) : new Date(),
        createdAt: save.createdAt ? new Date(save.createdAt) : new Date(),
        publishedAt: save.publishedAt ? new Date(save.publishedAt) : null,
        status: "complete",
        listKinds: ["saved"],
        ingestCompletedAt: new Date(),
      };
      await executeBatch([
        ...(await prepareTagRegistryUpdates(save.tags)),
        {
          kind: "create",
          model: "save",
          id,
          data,
          meta: { actor: "user", actorReason: "package-import" },
        },
      ]);
      const inserted = await readSave(id);
      if (inserted) writeEnrichmentSidecar(inserted);
      if (!(await setSaveFolders(id, folderIds)).ok)
        throw new Error("Could not assign imported folders.");
    });
  },
};

async function exportPackage(ids: readonly string[], destination: string) {
  const parent = await realpath(dirname(resolve(destination)));
  const staging = await mkdtemp(join(parent, ".pond-package-"));
  try {
    const result = await exportSavesToDirectory(ids, staging, {
      includeDerived: true,
    });
    await readPackage(staging);
    const path = join(parent, basename(destination));
    checkTransferCancellation();
    await rename(staging, path);
    return { path, exported: result.exported };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function hashFile(path: string) {
  const hash = createHash("sha256");
  let size = 0;
  const metadata = await libraryMediaMetadata(path);
  for await (const bytes of readLibraryMediaRange({
    path,
    start: 0,
    endExclusive: metadata.originalSize,
  })) {
    checkTransferCancellation();
    hash.update(bytes);
    size += bytes.length;
  }
  return { sha256: hash.digest("hex"), size };
}

async function readPackage(directory: string) {
  const root = await realpath(directory);
  const manifest = PackageSchema.parse(
    JSON.parse(await readFile(join(root, "pond-export.json"), "utf8")),
  );
  const folders = new Map(
    manifest.folders.map((folder) => [folder.id, folder]),
  );
  if (
    folders.size !== manifest.folders.length ||
    new Set(manifest.saves.map((save) => save.id)).size !==
      manifest.saves.length
  )
    throw new Error("The package contains duplicate identities.");
  for (const folder of manifest.folders) {
    const seen = new Set<string>([folder.id]);
    let parent = folder.parentId;
    while (parent) {
      if (seen.has(parent) || !folders.has(parent))
        throw new Error("The package folder hierarchy is invalid.");
      seen.add(parent);
      parent = folders.get(parent)?.parentId ?? null;
    }
  }
  if (manifest.organization)
    validatePackageOrganization(manifest.organization, folders);
  for (const save of manifest.saves) {
    if (save.folderIds.some((id) => !folders.has(id)))
      throw new Error("The package references a missing folder.");
    const names = new Set<string>();
    for (const file of save.files) {
      const target = resolve(root, file.path);
      const key = relative(root, target).toLowerCase();
      if (
        isAbsolute(file.path) ||
        file.path.includes("\\") ||
        !target.startsWith(`${root}${sep}`) ||
        [
          "info.json",
          "source.json",
          "user-title.json",
          "enrichment.json",
        ].includes(key) ||
        names.has(key)
      )
        throw new Error("A package original path is unsafe or duplicated.");
      names.add(key);
    }
  }
  const paths = new Map<string, Map<string, string>>();
  await transferPhase("Verifying package", manifest.exportedFiles.length);
  for (const entry of manifest.exportedFiles) {
    checkTransferCancellation();
    const path = await realpath(resolve(root, entry.path));
    if (!path.startsWith(`${root}${sep}`))
      throw new Error("A package file is outside the package.");
    const save = manifest.saves.find((item) => item.id === entry.saveId);
    const file = save?.files.find((item) => item.path === entry.sourcePath);
    if (!file) throw new Error("The package contains an unrecognized file.");
    const actual = await hashFile(path);
    if (
      actual.size !== file.size ||
      (file.sha256 && actual.sha256 !== file.sha256)
    )
      throw new Error("A package original is missing or damaged.");
    await transferProgress(entry.path, file.size);
    const originals = paths.get(entry.saveId) ?? new Map<string, string>();
    originals.set(entry.sourcePath, path);
    paths.set(entry.saveId, originals);
  }
  for (const save of manifest.saves) {
    if (save.files.some((file) => !paths.get(save.id)?.has(file.path)))
      throw new Error("The package is missing an original.");
  }
  return { manifest, paths };
}

const imports = new WeakMap<PackageImportRuntime, Promise<void>>();
async function importPackage(
  directory: string,
  dependencies: PackageImportRuntime = runtime,
) {
  const operation = (imports.get(dependencies) ?? Promise.resolve()).then(
    async () => {
      const { manifest, paths } = await readPackage(directory);
      if (manifest.organization && !dependencies.organization)
        throw new Error(
          "This destination does not support library organization transfer.",
        );
      const folderIds = await dependencies.folders(manifest.folders);
      checkTransferCancellation();
      if (manifest.organization)
        await dependencies.organization?.(
          manifest.organization,
          folderIds,
          new Map(),
        );
      const savedIds = new Map<string, string>();
      let imported = 0;
      let skipped = 0;
      await transferPhase("Importing Saves", manifest.saves.length);
      for (const save of manifest.saves) {
        checkTransferCancellation();
        const assigned = save.folderIds
          .map((id) => folderIds.get(id))
          .filter((id): id is string => Boolean(id));
        const existingId = await dependencies.existing(save);
        if (existingId) {
          savedIds.set(save.id, existingId);
          skipped += 1;
          await transferProgress(save.title || save.id);
          continue;
        }
        const id = ulid();
        const destination = dependencies.directory(id);
        await mkdir(destination, { recursive: false });
        let copied = false;
        try {
          for (const file of save.files) {
            checkTransferCancellation();
            const source = paths.get(save.id)?.get(file.path);
            if (!source) throw new Error("A package original is missing.");
            const target = resolve(destination, file.path);
            await mkdir(dirname(target), { recursive: true });
            await copyLibraryMediaFile(source, target);
            const copiedFile = await hashFile(target);
            if (
              copiedFile.size !== file.size ||
              (file.sha256 && copiedFile.sha256 !== file.sha256)
            )
              throw new Error("A package file changed during import.");
          }
          checkTransferCancellation();
          copied = true;
          if (save.userTitleLocked)
            writeBundleJson(join(destination, "user-title.json"), {
              locked: true,
            });
          await dependencies.commit(id, save, assigned);
          imported += 1;
          savedIds.set(save.id, id);
          await transferProgress(
            save.title || save.id,
            save.files.reduce((total, file) => total + file.size, 0),
          );
        } finally {
          if (!copied) await rm(destination, { recursive: true, force: true });
        }
      }
      if (manifest.organization)
        await dependencies.organization?.(
          manifest.organization,
          folderIds,
          savedIds,
        );
      return { imported, skipped };
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

export function exportPondPackage(ids: readonly string[], destination: string) {
  return runLibraryTransfer(() => exportPackage(ids, destination));
}
export function importPondPackage(
  directory: string,
  dependencies: PackageImportRuntime = runtime,
) {
  return runLibraryTransfer(() => importPackage(directory, dependencies));
}
