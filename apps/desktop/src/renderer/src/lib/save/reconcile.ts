import { toMs } from "@shared/to-ms";
import type { Save } from "@/lib/types";
import { deleteSave, pool, upsertSave } from "@/stores/pool";

export interface SyncActionEvent {
  id: number;
  batchId: string | null;
  modelName: "save" | "tag" | "tag_group" | "tag_group_member" | "settings";
  modelId: string;
  action: "I" | "U" | "D" | "A";
  data: unknown;
  prevData: unknown;
  actor: "user" | "system";
  actorReason: string | null;
  createdAt: string;
}

export function applyAction(event: SyncActionEvent): void {
  if (event.modelName !== "save") return;

  if (event.action === "I") {
    const save = normalise(event.data as Partial<Save>);
    if (save) upsertSave(save);
    return;
  }

  if (event.action === "U") {
    const patch = event.data as Partial<Save>;
    const existing = pool.get(event.modelId);
    if (!existing) {
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
    const patched = event.data as Partial<Save>;
    const merged = normalise({ ...existing, ...patched });
    if (merged) upsertSave(merged);
  }
}

export function normalise(raw: Partial<Save> | null | undefined): Save | null {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    source: raw.source ?? "twitter",
    sourceId: raw.sourceId ?? "",
    accountId: raw.accountId ?? null,
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
    /** Enrichment outputs must be carried through: sync U/A patches rarely re-send them, so dropping them here would wipe captions/OCR/transcripts on every unrelated update. */
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
    autoTitleModel: raw.autoTitleModel ?? null,
    suggestedTags: raw.suggestedTags ?? null,
    suggestedTagsModel: raw.suggestedTagsModel ?? null,
    videoNotes: raw.videoNotes ?? [],
    dominantColors: raw.dominantColors ?? [],
    tags: raw.tags ?? [],
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
