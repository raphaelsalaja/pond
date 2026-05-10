import { notifyAll, notifyId, pool } from "./pool";
import type { Save } from "./types";

/**
 * Sync action emitted by main. Shape mirrors `SyncAction` in
 * `@pond/schema/db`. Kept as a narrow local type so the renderer doesn't
 * import any Node-adjacent modules.
 */
export interface SyncActionEvent {
  id: number;
  batchId: string | null;
  modelName: "save" | "tag" | "settings";
  modelId: string;
  action: "I" | "U" | "D" | "A";
  data: unknown;
  prevData: unknown;
  actor: "user" | "ai" | "system";
  actorReason: string | null;
  createdAt: string;
}

/**
 * Apply a sync-action from main to the local Object Pool and notify all
 * subscribers. Called from the preload bridge on every `sync-action`
 * event.
 */
export function applyAction(event: SyncActionEvent): void {
  if (event.modelName !== "save") return;

  if (event.action === "I") {
    const save = normalise(event.data as Partial<Save>);
    if (!save) return;
    pool.upsert(save);
    notifyId(save.id);
    return;
  }

  if (event.action === "U") {
    const existing = pool.get(event.modelId);
    if (!existing) {
      // We don't have it yet — a reconciliation scan will pick it up.
      const created = normalise(event.data as Partial<Save>);
      if (created) {
        pool.upsert(created);
        notifyId(created.id);
      }
      return;
    }
    const merged = normalise({
      ...existing,
      ...(event.data as Partial<Save>),
      id: existing.id,
    });
    if (!merged) return;
    pool.upsert(merged);
    notifyId(merged.id);
    return;
  }

  if (event.action === "D") {
    pool.delete(event.modelId);
    notifyAll();
    return;
  }

  if (event.action === "A") {
    // Archive/unarchive just toggles `archivedAt`; the executor passes
    // the patched row through `data`.
    const existing = pool.get(event.modelId);
    if (!existing) return;
    const patched = event.data as Partial<Save>;
    const merged = normalise({ ...existing, ...patched });
    if (!merged) return;
    pool.upsert(merged);
    notifyId(event.modelId);
  }
}

export function normalise(raw: Partial<Save> | null | undefined): Save | null {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    source: raw.source ?? "article",
    sourceId: raw.sourceId ?? "",
    url: raw.url ?? "",
    title: raw.title ?? null,
    description: raw.description ?? null,
    author: raw.author ?? null,
    notes: raw.notes ?? null,
    mediaUrl: raw.mediaUrl ?? null,
    blobUrl: raw.blobUrl ?? null,
    mediaType: raw.mediaType ?? null,
    files: raw.files ?? [],
    coverIndex: raw.coverIndex,
    width: raw.width ?? null,
    height: raw.height ?? null,
    fileSize: raw.fileSize ?? null,
    dominantColors: raw.dominantColors ?? null,
    blurDataUrl: raw.blurDataUrl ?? null,
    tags: raw.tags ?? [],
    aiTags: raw.aiTags ?? [],
    aiCaption: raw.aiCaption ?? null,
    aiSummary: raw.aiSummary ?? null,
    aiSuggestions: raw.aiSuggestions ?? null,
    classification: raw.classification ?? null,
    articleHtml: raw.articleHtml ?? null,
    articleText: raw.articleText ?? null,
    articleReadingMinutes: raw.articleReadingMinutes ?? null,
    ocrText: raw.ocrText ?? null,
    annotations: raw.annotations ?? null,
    rawJson: raw.rawJson ?? undefined,
    savedAt: toIso(raw.savedAt) ?? new Date().toISOString(),
    createdAt: toIso(raw.createdAt) ?? new Date().toISOString(),
    embeddingUpdatedAt: toIso(raw.embeddingUpdatedAt),
    archivedAt: toIso(raw.archivedAt),
    deletedAt: toIso(raw.deletedAt),
  };
}

/**
 * Renderer-side defensive converter. The wire layer in main already
 * converts Date columns to ISO strings, but we accept Date / number /
 * string here too so the pool survives schema drift or a main build
 * that hasn't been restarted.
 */
function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? v.toISOString() : null;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (typeof v === "string") return v;
  return null;
}
