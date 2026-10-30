import { readFileSync } from "node:fs";
import {
  open,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { MEDIA_TYPES, SOURCES } from "@pond/schema/db";
import { legacyImportOrigin, toImportOrigin } from "@pond/schema/import-origin";
import { StoredRawJsonSchema, storedAsRawJson } from "@pond/schema/raw-schema";
import { ulid } from "ulid";
import { z } from "zod";
import { writeBundleJson } from "../lib/library-config";
import {
  INFO_SCHEMA,
  type InfoDoc,
  StoredInfoDocSchema,
} from "../lib/library-format";
import { type ExportItem, exportFiles } from "./export-files";
import { verifyLibraryBackup } from "./library-backup";
import { runLibraryTransfer } from "./library-transfers";
import { OrganizationBundleSchema } from "./organization-bundle";
import {
  mergePackageOrganization,
  readPackageOrganization,
} from "./package-organization";
import { importPondPackage } from "./pond-package";

const OrganizationEnvelope = z.object({ data: OrganizationBundleSchema });
const EnrichmentEnvelope = z.object({
  data: z.object({
    caption: z.string().nullable().optional(),
    captionModel: z.string().nullable().optional(),
    ocrText: z.string().nullable().optional(),
    ocrModel: z.string().nullable().optional(),
    transcript: z.string().nullable().optional(),
    transcriptModel: z.string().nullable().optional(),
  }),
});

function readLibraryText(path: string): string {
  return readFileSync(path).toString("utf8");
}
const TransferLock = z.object({ pid: z.number().int(), host: z.string() });

async function readOrganization(root: string) {
  const path = join(root, "organization.json");
  const text = await readFile(path)
    .then((value) => value.toString("utf8"))
    .catch(() => null);
  if (!text)
    throw new Error("Open this library in Pond once before transferring it.");
  return { text, data: OrganizationEnvelope.parse(JSON.parse(text)).data };
}
async function readSaves(root: string, includeTrash = false) {
  const items = [];
  for (const bucket of includeTrash ? ["items", "trash"] : ["items"]) {
    for (const entry of await readdir(join(root, bucket), {
      withFileTypes: true,
    }).catch(() => [])) {
      if (!entry.isDirectory() || !entry.name.endsWith(".info")) continue;
      const directory = join(root, bucket, entry.name);
      const infoPath = join(directory, "info.json");
      const info = StoredInfoDocSchema.parse(
        JSON.parse(await readFile(infoPath, "utf8")),
      );
      items.push({ directory, info });
    }
  }
  return items;
}
async function acquireLock(root: string) {
  const path = join(root, ".pond-transfer.lock");
  try {
    const handle = await open(path, "wx");
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, host: hostname() }),
    );
    return { handle, path };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EEXIST"
    )
      throw error;
    const lock = TransferLock.safeParse(
      JSON.parse(await readFile(path, "utf8")),
    );
    if (lock.success && lock.data.host === hostname()) {
      try {
        process.kill(lock.data.pid, 0);
      } catch (cause) {
        if (
          cause instanceof Error &&
          "code" in cause &&
          cause.code === "ESRCH"
        ) {
          await rm(path);
          return acquireLock(root);
        }
      }
    }
    throw new Error(
      "Another transfer is using this library. Wait for it to finish.",
    );
  }
}

export function copyPackageToLibrary(packagePath: string, libraryPath: string) {
  return runLibraryTransfer(async () => {
    const root = await realpath(libraryPath);
    if ((await verifyLibraryBackup(root)).verifiedManifest)
      throw new Error("Restore this backup before adding Saves to it.");
    const lock = await acquireLock(root);
    try {
      const organization = await readOrganization(root);
      let expectedOrganization = organization.text;
      let tagCatalog = await readPackageOrganization(
        root,
        organization.data.views,
        organization.data.folders.map((folder) => folder.id),
      );
      const items = await readSaves(root, true);
      const existing = new Map(
        items.map(({ info }) => [`${info.source}\0${info.sourceId}`, info.id]),
      );
      const result = await importPondPackage(packagePath, {
        directory: (id) => join(root, "items", `${id}.info`),
        async existing(save) {
          return (
            existing.get(
              `${save.source ?? "local"}\0${save.sourceId || `pondpack:${save.id}`}`,
            ) ?? null
          );
        },
        async folders(folders) {
          const mapped = new Map<string, string>();
          const pending = [...folders];
          while (pending.length) {
            const index = pending.findIndex(
              (folder) => !folder.parentId || mapped.has(folder.parentId),
            );
            if (index < 0)
              throw new Error("The package folder hierarchy is invalid.");
            const folder = pending.splice(index, 1)[0];
            if (!folder) throw new Error("The package folder is missing.");
            const parent = folder.parentId
              ? (mapped.get(folder.parentId) ?? null)
              : null;
            let match = organization.data.folders.find(
              (row) =>
                row.parent_id === parent &&
                row.name.toLowerCase() === folder.name.toLowerCase(),
            );
            if (!match) {
              match = {
                id: ulid(),
                parent_id: parent,
                name: folder.name,
                color: folder.color ?? null,
                sort_order: organization.data.folders.filter(
                  (row) => row.parent_id === parent,
                ).length,
                created_at: Date.now(),
              };
              organization.data.folders.push(match);
            }
            mapped.set(folder.id, match.id);
          }
          if (
            readLibraryText(join(root, "organization.json")) !==
            expectedOrganization
          )
            throw new Error(
              "The destination library changed during transfer. Try again after its edits finish.",
            );
          writeBundleJson(join(root, "organization.json"), organization.data);
          expectedOrganization = readLibraryText(
            join(root, "organization.json"),
          );
          return mapped;
        },
        async organization(incoming, folderIds, saveIds) {
          if (
            readLibraryText(join(root, "organization.json")) !==
            expectedOrganization
          )
            throw new Error(
              "The destination organization changed during transfer.",
            );
          const existing = await readPackageOrganization(
            root,
            organization.data.views,
            organization.data.folders.map((folder) => folder.id),
          );
          const merged = mergePackageOrganization(
            existing,
            incoming,
            folderIds,
            saveIds,
          );
          tagCatalog = merged;
          organization.data.views = merged.views;
          writeBundleJson(join(root, "organization.json"), organization.data);
          expectedOrganization = readLibraryText(
            join(root, "organization.json"),
          );
          const settingsFile = join(root, "settings.json");
          const settingsText = await readFile(settingsFile)
            .then((value) => value.toString("utf8"))
            .catch((error: NodeJS.ErrnoException) => {
              if (error.code === "ENOENT") return null;
              throw error;
            });
          const settings = settingsText
            ? z
                .object({ data: z.record(z.string(), z.json()) })
                .parse(JSON.parse(settingsText)).data
            : {};
          writeBundleJson(settingsFile, {
            ...settings,
            folderRules: merged.folderRules,
            folderViews: merged.folderViews,
          });
          writeBundleJson(join(root, "tags.json"), {
            tags: merged.tags,
            groups: merged.groups,
            members: merged.members,
          });
        },
        async commit(id, save, folderIds) {
          if (
            readLibraryText(join(root, "organization.json")) !==
            expectedOrganization
          )
            throw new Error("The destination library changed during transfer.");
          const info: InfoDoc = {
            schema: INFO_SCHEMA,
            id,
            source: save.source ?? "local",
            sourceId: save.sourceId || `pondpack:${save.id}`,
            url: save.url,
            title: save.title,
            description: save.description ?? null,
            author: save.author ?? null,
            lang: save.lang ?? null,
            siteName: save.siteName ?? null,
            notes: save.notes,
            tags: save.tags,
            folderIds,
            mediaType: save.mediaType ?? null,
            coverIndex: save.coverIndex ?? 0,
            width: save.width ?? null,
            height: save.height ?? null,
            savedAt: save.savedAt ?? new Date().toISOString(),
            createdAt: save.createdAt ?? new Date().toISOString(),
            publishedAt: save.publishedAt ?? null,
            deletedAt: null,
            files: save.files.map((file) => ({
              path: file.path,
              kind: file.kind,
              size: file.size,
              sha256: file.sha256,
              mimeType: file.mimeType ?? undefined,
              width: file.width ?? undefined,
              height: file.height ?? undefined,
            })),
            userData: {
              rating: save.rating ?? null,
              dominantColors: save.dominantColors ?? [],
              primaryColor: save.primaryColor ?? null,
              rotate: save.rotate ?? 0,
              flipX: save.flipX ?? false,
              flipY: save.flipY ?? false,
              crop: save.crop ?? null,
            },
          };
          const directory = join(root, "items", `${id}.info`);
          if (save.rawJson) {
            const sourcePath = join(directory, "source.json");
            await writeFile(sourcePath, JSON.stringify(save.rawJson), {
              flag: "wx",
            });
          }
          writeBundleJson(join(directory, "enrichment.json"), {
            caption: save.caption,
            captionModel: save.captionModel,
            ocrText: save.ocrText,
            ocrModel: save.ocrModel,
            transcript: save.transcript,
            transcriptModel: save.transcriptModel,
            dominantColors: save.dominantColors,
          });
          const infoPath = join(directory, "info.json");
          await writeFile(infoPath, JSON.stringify(info, null, 2), {
            flag: "wx",
          });
          const knownTags = new Set(
            tagCatalog.tags.map((tag) => tag.name.toLowerCase()),
          );
          let addedTags = false;
          for (const name of save.tags) {
            if (knownTags.has(name.toLowerCase())) continue;
            tagCatalog.tags.push({
              id: ulid(),
              name,
              description: null,
              starred: false,
              archived: false,
              lastUsedAt: Date.now(),
              usageCount: 0,
              createdAt: Date.now(),
            });
            knownTags.add(name.toLowerCase());
            addedTags = true;
          }
          if (addedTags)
            writeBundleJson(join(root, "tags.json"), {
              tags: tagCatalog.tags,
              groups: tagCatalog.groups,
              members: tagCatalog.members,
            });
          existing.set(`${info.source}\0${info.sourceId}`, id);
        },
      });
      await verifyLibraryBackup(root);
      return { ...result, path: root };
    } finally {
      await lock.handle.close();
      await rm(lock.path);
    }
  });
}

export function packageLibrary(libraryPath: string, destination: string) {
  return runLibraryTransfer(async () => {
    const root = await realpath(resolve(libraryPath));
    await verifyLibraryBackup(root);
    const organization = await readOrganization(root);
    const items: ExportItem[] = [];
    for (const { directory, info } of await readSaves(root)) {
      if (info.deletedAt) continue;
      const sourcePath = join(directory, "source.json");
      const raw = await readFile(sourcePath)
        .then((value) => value.toString("utf8"))
        .catch(() => null);
      const enrichmentPath = join(directory, "enrichment.json");
      const enrichmentText = await readFile(enrichmentPath)
        .then((value) => value.toString("utf8"))
        .catch(() => null);
      const enrichment = enrichmentText
        ? EnrichmentEnvelope.parse(JSON.parse(enrichmentText)).data
        : {};
      items.push({
        directory,
        folderIds: info.folderIds,
        save: {
          ...info,
          ...info.userData,
          ...enrichment,
          notes: info.notes ?? null,
          source: z.enum(SOURCES).parse(info.source),
          importedFrom:
            toImportOrigin(info.importedFrom) ?? legacyImportOrigin(info),
          mediaType: z.enum(MEDIA_TYPES).nullable().parse(info.mediaType),
          rawJson: raw
            ? storedAsRawJson(StoredRawJsonSchema.parse(JSON.parse(raw)))
            : null,
          savedAt: info.savedAt ? new Date(info.savedAt) : undefined,
          createdAt: info.createdAt ? new Date(info.createdAt) : undefined,
          publishedAt: info.publishedAt
            ? new Date(info.publishedAt)
            : undefined,
        },
      });
    }
    return exportFiles({
      directory: destination,
      includeDerived: true,
      organization: await readPackageOrganization(
        root,
        organization.data.views,
        organization.data.folders.map((folder) => folder.id),
      ),
      items,
      folders: organization.data.folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parent_id,
        color: folder.color,
        sortOrder: folder.sort_order,
      })),
    });
  });
}
