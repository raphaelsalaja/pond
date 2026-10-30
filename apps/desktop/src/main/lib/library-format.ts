import type { Save } from "@pond/schema/db";
import { z } from "zod";

export const INFO_FILE = "info.json";
export const SOURCE_FILE = "source.json";
export const INFO_SCHEMA = 4 as const;

export interface InfoFile {
  kind: string;
  path: string;
  sha256: string;
  size: number;
  sourceUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export type SaveUserData = Pick<
  Save,
  | "rating"
  | "dominantColors"
  | "primaryColor"
  | "rotate"
  | "flipX"
  | "flipY"
  | "crop"
>;

export interface InfoDoc {
  userData?: SaveUserData;
  schema: typeof INFO_SCHEMA;
  id: string;
  source: string;
  sourceId: string;
  importedFrom?: string;
  url: string;
  title: string | null;
  description: string | null;
  author: string | null;
  lang: string | null;
  siteName: string | null;
  notes: string | null;
  tags: string[];
  folderIds: string[];
  mediaType: string | null;
  coverIndex: number;
  width: number | null;
  height: number | null;
  publishedAt: string | null;
  savedAt: string | null;
  createdAt: string | null;
  deletedAt: string | null;
  files: InfoFile[];
}

const nullableText = z.string().nullable().catch(null);

export const StoredInfoDocSchema = z.object({
  userData: z
    .object({
      rating: z.number().min(0).max(5).nullable(),
      dominantColors: z.array(z.string()),
      primaryColor: z
        .string()
        .nullish()
        .catch(null)
        .transform((value) => value ?? null),
      rotate: z.number(),
      flipX: z.boolean(),
      flipY: z.boolean(),
      crop: z
        .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
        .nullable(),
    })
    .optional(),
  schema: z.number().int().optional(),
  id: z.string().catch(""),
  source: z.string().catch(""),
  sourceId: z.string().catch(""),
  importedFrom: z.string().optional().catch(undefined),
  url: z.string().catch(""),
  title: nullableText,
  description: nullableText,
  author: nullableText,
  lang: nullableText,
  siteName: nullableText,
  notes: nullableText,
  tags: z.array(z.string()).catch([]),
  folderIds: z.array(z.string()).catch([]),
  mediaType: nullableText,
  coverIndex: z.number().int().nonnegative().catch(0),
  width: z.number().nullable().catch(null),
  height: z.number().nullable().catch(null),
  publishedAt: nullableText,
  savedAt: nullableText,
  createdAt: nullableText,
  deletedAt: nullableText,
  files: z
    .array(
      z.object({
        kind: z.string().catch("other"),
        path: z.string().catch(""),
        sha256: z.string().catch(""),
        size: z.number().catch(0),
        sourceUrl: z.string().optional().catch(undefined),
        mimeType: z.string().optional().catch(undefined),
        width: z.number().optional().catch(undefined),
        height: z.number().optional().catch(undefined),
      }),
    )
    .catch([]),
});

export type StoredInfoDoc = z.infer<typeof StoredInfoDocSchema>;

export function infoFilesFromSave(files: Save["files"]): InfoFile[] {
  return files.map((file) => ({
    kind: file.kind,
    path: file.path,
    sha256: file.sha256,
    size: file.size,
    mimeType: file.mimeType ?? undefined,
    width: file.width ?? undefined,
    height: file.height ?? undefined,
    sourceUrl: file.sourceUrl ?? undefined,
  }));
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function infoDocFromSave(
  save: Save,
  files: InfoFile[],
  folderIds: string[] = [],
): InfoDoc {
  return {
    userData: {
      rating: save.rating ?? null,
      dominantColors: save.dominantColors ?? [],
      primaryColor: save.primaryColor ?? null,
      rotate: save.rotate ?? 0,
      flipX: save.flipX ?? false,
      flipY: save.flipY ?? false,
      crop: save.crop ?? null,
    },
    schema: INFO_SCHEMA,
    id: save.id,
    source: save.source,
    sourceId: save.sourceId,
    ...(save.importedFrom && { importedFrom: save.importedFrom }),
    url: save.url,
    title: save.title ?? null,
    description: save.description ?? null,
    author: save.author ?? null,
    lang: save.lang ?? null,
    siteName: save.siteName ?? null,
    notes: save.notes ?? null,
    tags: save.tags ?? [],
    folderIds: folderIds ?? [],
    mediaType: save.mediaType ?? null,
    coverIndex: save.coverIndex ?? 0,
    width: save.width ?? null,
    height: save.height ?? null,
    publishedAt: toIso(save.publishedAt),
    savedAt: toIso(save.savedAt),
    createdAt: toIso(save.createdAt),
    deletedAt: toIso(save.deletedAt),
    files,
  };
}

const EXPORTED_SAVE_FIELDS = [
  "files",
  "rating",
  "dominantColors",
  "primaryColor",
  "rotate",
  "flipX",
  "flipY",
  "crop",
  "importedFrom",
  "url",
  "title",
  "description",
  "author",
  "lang",
  "siteName",
  "notes",
  "tags",
  "folderIds",
  "mediaType",
  "coverIndex",
  "width",
  "height",
  "publishedAt",
  "deletedAt",
] as const;

const EXPORTED_FIELD_SET = new Set<string>(EXPORTED_SAVE_FIELDS);

export function patchTouchesInfo(patch: Partial<Save>): boolean {
  return Object.keys(patch).some((key) => EXPORTED_FIELD_SET.has(key));
}

export function applyPatchToInfo(
  info: StoredInfoDoc,
  patch: Partial<Save>,
): InfoDoc {
  const next: InfoDoc = {
    ...info,
    userData: info.userData,
    notes: info.notes ?? null,
    schema: INFO_SCHEMA,
  };
  const userFields = [
    "rating",
    "dominantColors",
    "primaryColor",
    "rotate",
    "flipX",
    "flipY",
    "crop",
  ] as const;
  if (userFields.some((key) => patch[key] !== undefined)) {
    next.userData = {
      rating: info.userData?.rating ?? null,
      dominantColors: info.userData?.dominantColors ?? [],
      primaryColor: info.userData?.primaryColor ?? null,
      rotate: info.userData?.rotate ?? 0,
      flipX: info.userData?.flipX ?? false,
      flipY: info.userData?.flipY ?? false,
      crop: info.userData?.crop ?? null,
    };
    if (patch.rating !== undefined) next.userData.rating = patch.rating;
    if (patch.dominantColors !== undefined)
      next.userData.dominantColors = patch.dominantColors ?? [];
    if (patch.primaryColor !== undefined)
      next.userData.primaryColor = patch.primaryColor;
    if (patch.rotate !== undefined) next.userData.rotate = patch.rotate ?? 0;
    if (patch.flipX !== undefined) next.userData.flipX = patch.flipX ?? false;
    if (patch.flipY !== undefined) next.userData.flipY = patch.flipY ?? false;
    if (patch.crop !== undefined) next.userData.crop = patch.crop;
  }

  if (patch.files !== undefined) next.files = infoFilesFromSave(patch.files);
  if (patch.importedFrom !== undefined)
    next.importedFrom = patch.importedFrom ?? undefined;
  if (patch.url !== undefined) next.url = patch.url;
  if (patch.title !== undefined) next.title = patch.title ?? null;
  if (patch.description !== undefined)
    next.description = patch.description ?? null;
  if (patch.author !== undefined) next.author = patch.author ?? null;
  if (patch.lang !== undefined) next.lang = patch.lang ?? null;
  if (patch.siteName !== undefined) next.siteName = patch.siteName ?? null;
  if (patch.notes !== undefined) next.notes = patch.notes ?? null;
  if (patch.tags !== undefined) next.tags = patch.tags ?? [];
  if ("folderIds" in patch) {
    const parsed = z.array(z.string()).safeParse(patch.folderIds);
    if (parsed.success) next.folderIds = parsed.data;
  }
  if (patch.mediaType !== undefined) next.mediaType = patch.mediaType ?? null;
  if (patch.coverIndex !== undefined) next.coverIndex = patch.coverIndex ?? 0;
  if (patch.width !== undefined) next.width = patch.width ?? null;
  if (patch.height !== undefined) next.height = patch.height ?? null;
  if (patch.publishedAt !== undefined)
    next.publishedAt = toIso(patch.publishedAt);
  if (patch.deletedAt !== undefined) next.deletedAt = toIso(patch.deletedAt);
  return next;
}
