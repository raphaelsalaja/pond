import {
  MEDIA_TYPES,
  OPS,
  SAVE_STATUSES,
  SOURCES,
  TASK_STATUSES,
} from "@pond/schema/db";
import { IMPORT_ORIGINS } from "@pond/schema/import-origin";
import { LIST_KINDS } from "@pond/schema/list-kinds";
import { StoredRawJsonSchema, storedAsRawJson } from "@pond/schema/raw-schema";
import { toMs } from "@shared/to-ms";
import { z } from "zod";
import { deleteSave, pool, upsertSave } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";

const Text = z.string().nullish().catch(null);
const Num = z.number().nullish().catch(null);
const Texts = z.array(z.string()).nullish().catch(null);
const Timestamp = z
  .union([z.number(), z.string(), z.date()])
  .nullish()
  .catch(null);

const SaveFileSchema = z.object({
  kind: z.string(),
  path: z.string(),
  sha256: z.string(),
  size: z.number(),
  mimeType: Text,
  width: Num,
  height: Num,
});

const SaveTaskSchema = z.object({
  op: z.enum(OPS),
  status: z.enum(TASK_STATUSES),
  attempts: z.number(),
  maxAttempts: z.number(),
  lastError: z.string().nullable(),
  nextRunAt: z.number(),
  updatedAt: z.number(),
});

export const SavePatchSchema = z.object({
  id: z.string().min(1),
  source: z.enum(SOURCES).nullish().catch(null),
  sourceId: Text,
  accountId: Text,
  importedFrom: z.enum(IMPORT_ORIGINS).nullish().catch(null),
  url: Text,
  title: Text,
  description: Text,
  author: Text,
  notes: Text,
  mediaUrl: Text,
  mediaType: z.enum(MEDIA_TYPES).nullish().catch(null),
  files: z.array(SaveFileSchema).nullish().catch(null),
  coverIndex: z.number().optional().catch(undefined),
  width: Num,
  height: Num,
  fileSize: Num,
  phash: Text,
  blurhash: Text,
  caption: Text,
  captionModel: Text,
  ocrText: Text,
  ocrModel: Text,
  transcript: Text,
  transcriptModel: Text,
  embeddingModel: Text,
  clipEmbedding: z.array(z.number()).nullish().catch(null),
  clipModel: Text,
  aesthetic: Texts,
  aestheticModel: Text,
  sensitiveScore: Num,
  sensitiveModel: Text,
  autoTitleModel: Text,
  suggestedTags: Texts,
  suggestedTagsModel: Text,
  rating: Num,
  rotate: z.number().nullish().catch(0),
  flipX: z.boolean().nullish().catch(false),
  flipY: z.boolean().nullish().catch(false),
  crop: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    })
    .nullish()
    .catch(null),
  dominantColors: Texts,
  primaryColor: Text,
  tags: Texts,
  listKinds: z.array(z.enum(LIST_KINDS)).nullish().catch(null),
  rawJson: StoredRawJsonSchema.transform(storedAsRawJson).nullish().catch(null),
  status: z.enum(SAVE_STATUSES).optional().catch(undefined),
  ingestStartedAt: Timestamp,
  ingestCompletedAt: Timestamp,
  tasks: z.array(SaveTaskSchema).optional().catch(undefined),
  savedAt: Timestamp,
  createdAt: Timestamp,
  publishedAt: Timestamp,
  deletedAt: Timestamp,
});

export type SavePatch = z.infer<typeof SavePatchSchema>;

export const SavePatchesSchema = z.array(
  SavePatchSchema.nullable().catch(null),
);

export const SyncActionEventSchema = z.object({
  modelName: z.string().catch(""),
  modelId: z.string().catch(""),
  action: z.enum(["I", "U", "D", "A"]).nullish().catch(null),
  data: SavePatchSchema.partial().nullish().catch(null),
});

export type SyncActionEvent = z.infer<typeof SyncActionEventSchema>;

export function applyAction(event: SyncActionEvent): void {
  if (event.modelName !== "save") return;

  if (event.action === "I") {
    const save = normalise(event.data);
    if (save) upsertSave(save);
    return;
  }

  if (event.action === "U") {
    const patch = event.data;
    const existing = pool.get(event.modelId);
    if (!existing) {
      if (!patch?.url) return;
      const created = normalise(patch);
      if (created) upsertSave(created);
      return;
    }
    const merged = normalise({
      ...existing,
      ...patch,
      id: existing.id,
    });
    if (merged) upsertSave(merged);
    return;
  }

  if (event.action === "D") {
    deleteSave(event.modelId);
    return;
  }

  if (event.action === "A") {
    const existing = pool.get(event.modelId);
    if (!existing) return;
    const merged = normalise({ ...existing, ...event.data });
    if (merged) upsertSave(merged);
  }
}

export function normalise(
  raw: Partial<SavePatch> | null | undefined,
): Save | null {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    source: raw.source ?? "twitter",
    sourceId: raw.sourceId ?? "",
    accountId: raw.accountId ?? null,
    importedFrom: raw.importedFrom ?? null,
    url: raw.url ?? "",
    title: raw.title ?? null,
    description: raw.description ?? null,
    author: raw.author ?? null,
    notes: raw.notes ?? null,
    mediaUrl: raw.mediaUrl ?? null,
    mediaType: raw.mediaType ?? null,
    files: raw.files ?? [],
    coverIndex: raw.coverIndex,
    width: raw.width ?? null,
    height: raw.height ?? null,
    fileSize: raw.fileSize ?? null,
    phash: raw.phash ?? null,
    blurhash: raw.blurhash ?? null,
    caption: raw.caption ?? null,
    captionModel: raw.captionModel ?? null,
    ocrText: raw.ocrText ?? null,
    ocrModel: raw.ocrModel ?? null,
    transcript: raw.transcript ?? null,
    transcriptModel: raw.transcriptModel ?? null,
    clipEmbedding: raw.clipEmbedding ?? null,
    clipModel: raw.clipModel ?? null,
    aesthetic: raw.aesthetic ?? null,
    aestheticModel: raw.aestheticModel ?? null,
    sensitiveScore: raw.sensitiveScore ?? null,
    sensitiveModel: raw.sensitiveModel ?? null,
    autoTitleModel: raw.autoTitleModel ?? null,
    suggestedTags: raw.suggestedTags ?? null,
    suggestedTagsModel: raw.suggestedTagsModel ?? null,
    rating: raw.rating ?? null,
    rotate: raw.rotate ?? 0,
    flipX: raw.flipX ?? false,
    flipY: raw.flipY ?? false,
    crop: raw.crop ?? null,
    dominantColors: raw.dominantColors ?? [],
    primaryColor: raw.primaryColor ?? null,
    tags: raw.tags ?? [],
    listKinds: raw.listKinds ?? [],
    rawJson: raw.rawJson ?? undefined,
    status: raw.status,
    ingestStartedAt: toMs(raw.ingestStartedAt) ?? null,
    ingestCompletedAt: toMs(raw.ingestCompletedAt) ?? null,
    tasks: raw.tasks,
    savedAt: toMs(raw.savedAt) ?? Date.now(),
    createdAt: toMs(raw.createdAt) ?? Date.now(),
    publishedAt: toMs(raw.publishedAt),
    deletedAt: toMs(raw.deletedAt),
  };
}
