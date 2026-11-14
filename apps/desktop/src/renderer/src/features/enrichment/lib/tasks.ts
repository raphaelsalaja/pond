import type { Prefs } from "@pond/schema/db";
import { z } from "zod";
import { statusFeed } from "@/features/downloads/status-feed";
import { clearEmbeddings } from "@/features/enrichment/state/embedding-store";
import { clearMediaEmbeddings } from "@/features/enrichment/state/media-embedding-store";
import { bulkMutation, ensureSaves, pool } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { formatPlural } from "@/shared/lib/format";
import { getPrefsSnapshot } from "@/shared/state/prefs";

const ITEMS = { one: "item", other: "items" };

const BackfillReplySchema = z.object({
  ok: z.boolean().catch(false),
  updated: z.number().optional().catch(undefined),
});

export interface TaskResult {
  ok: boolean;
  message: string;
}

export const DISABLED_HINTS = {
  caption: "Turn on Image Captions in Enrichments first.",
  ocr: "Turn on Text in Images in Enrichments first.",
  transcribe: "Turn on Transcription in Enrichments first.",
  reembed: "Turn on Semantic Search in Enrichments first.",
  clip: "Turn on Visual Similarity in Enrichments first.",
  sensitiveContent: "Turn on Sensitive Content in Enrichments first.",
} as const;

export const TASK_ENABLED = {
  caption: (prefs: Prefs | null) => prefs?.ai?.enableCaption === true,
  ocr: (prefs: Prefs | null) => prefs?.ai?.enableOcr === true,
  transcribe: (prefs: Prefs | null) => prefs?.ai?.enableTranscript === true,
  reembed: (prefs: Prefs | null) => prefs?.ai?.semanticSearch === true,
  clip: (prefs: Prefs | null) => prefs?.ai?.enableClip === true,
  sensitiveContent: (prefs: Prefs | null) =>
    prefs?.ai?.enableSensitiveContent === true,
} as const;

export type TaskScope = readonly string[] | undefined;

function targetSaves(ids: TaskScope): Save[] {
  const live = pool.snapshot().filter((s) => !s.deletedAt);
  if (!ids || ids.length === 0) return live;
  const set = new Set(ids);
  return live.filter((s) => set.has(s.id));
}

export async function autoTag(ids?: TaskScope): Promise<TaskResult> {
  const targets = ids?.length
    ? [...ids]
    : (
        await window.pond.query("saves.queryIds", {
          query: { combinator: "and", rules: [] },
        })
      ).ids;
  const { changed } = await bulkMutation(targets, { kind: "suggested-tags" });
  if (changed > 0) {
    statusFeed.note(`Applied tags to ${formatPlural(changed, ITEMS)}`);
  }
  return {
    ok: true,
    message:
      changed > 0
        ? `Applied tags to ${formatPlural(changed, ITEMS)}.`
        : "No suggested tags to apply.",
  };
}

export async function backfillColors(): Promise<TaskResult> {
  const job = statusFeed.start("Backfilling colors");
  const res = BackfillReplySchema.parse(
    await window.pond.query("saves.backfillColors", {}),
  );
  if (!res.ok) {
    statusFeed.fail(job, "Color backfill failed.");
    return { ok: false, message: "Color backfill failed." };
  }
  const updated = res.updated ?? 0;
  statusFeed.done(
    job,
    updated > 0
      ? `Updated ${formatPlural(updated, ITEMS)}`
      : "All items already have colors",
  );
  return {
    ok: true,
    message:
      updated > 0
        ? `Updated ${formatPlural(updated, ITEMS)}.`
        : "All items already have colors.",
  };
}

export async function backfillMetadata(): Promise<TaskResult> {
  const job = statusFeed.start("Extracting media metadata");
  const res = BackfillReplySchema.parse(
    await window.pond.query("saves.backfillMetadata", {}),
  );
  if (!res.ok) {
    statusFeed.fail(job, "Media metadata extraction failed.");
    return { ok: false, message: "Media metadata extraction failed." };
  }
  const updated = res.updated ?? 0;
  statusFeed.done(
    job,
    updated > 0
      ? `Updated ${formatPlural(updated, ITEMS)}`
      : "Media metadata is up to date.",
  );
  return { ok: true, message: `${updated} updated` };
}

function kickRescan(ids?: TaskScope): void {
  void import("./sweep").then(({ rescanEnrichment }) => {
    rescanEnrichment(ids && ids.length > 0 ? ids : undefined);
  });
}

export function runEnrichment(): TaskResult {
  kickRescan();
  statusFeed.note("Enrichment sweep started");
  return { ok: true, message: "Enrichment sweep started." };
}

async function reprocessStamped(
  enabled: boolean,
  disabledHint: string,
  clear: (save: Save) => Save | null,
  ids: TaskScope,
): Promise<TaskResult> {
  if (!enabled) return { ok: false, message: disabledHint };
  if (ids?.length) await ensureSaves(ids);
  const updated: Save[] = [];
  for (const save of targetSaves(ids)) {
    const next = clear(save);
    if (next) updated.push(next);
  }
  pool.bulkUpsert(updated);
  kickRescan(ids);
  const n = updated.length;
  if (n > 0) {
    statusFeed.note(`Reprocessing ${formatPlural(n, ITEMS)} in the background`);
  }
  return {
    ok: true,
    message:
      n > 0
        ? `Reprocessing ${formatPlural(n, ITEMS)} in the background`
        : "Nothing to reprocess.",
  };
}

export function recaption(ids?: TaskScope): Promise<TaskResult> {
  return reprocessStamped(
    TASK_ENABLED.caption(getPrefsSnapshot()),
    DISABLED_HINTS.caption,
    (s) => (s.captionModel == null ? null : { ...s, captionModel: null }),
    ids,
  );
}

export function reocr(ids?: TaskScope): Promise<TaskResult> {
  return reprocessStamped(
    TASK_ENABLED.ocr(getPrefsSnapshot()),
    DISABLED_HINTS.ocr,
    (s) => (s.ocrModel == null ? null : { ...s, ocrModel: null }),
    ids,
  );
}

export function retranscribe(ids?: TaskScope): Promise<TaskResult> {
  return reprocessStamped(
    TASK_ENABLED.transcribe(getPrefsSnapshot()),
    DISABLED_HINTS.transcribe,
    (s) => (s.transcriptModel == null ? null : { ...s, transcriptModel: null }),
    ids,
  );
}

export async function reembed(ids?: TaskScope): Promise<TaskResult> {
  if (!TASK_ENABLED.reembed(getPrefsSnapshot()))
    return { ok: false, message: DISABLED_HINTS.reembed };
  if (ids?.length) await ensureSaves(ids);
  clearEmbeddings(ids && ids.length > 0 ? ids : undefined);
  return reprocessStamped(
    true,
    DISABLED_HINTS.reembed,
    (save) =>
      save.embeddingModel == null ? null : { ...save, embeddingModel: null },
    ids,
  );
}

export async function rebuildVisualIndex(ids?: TaskScope): Promise<TaskResult> {
  if (!TASK_ENABLED.clip(getPrefsSnapshot()))
    return { ok: false, message: DISABLED_HINTS.clip };
  if (ids?.length) await ensureSaves(ids);
  clearMediaEmbeddings(ids && ids.length > 0 ? ids : undefined);
  return reprocessStamped(
    true,
    DISABLED_HINTS.clip,
    (save) => (save.clipModel == null ? null : { ...save, clipModel: null }),
    ids,
  );
}

export function reclassifySensitiveContent(
  ids?: TaskScope,
): Promise<TaskResult> {
  return reprocessStamped(
    TASK_ENABLED.sensitiveContent(getPrefsSnapshot()),
    DISABLED_HINTS.sensitiveContent,
    (save) =>
      save.sensitiveModel == null ? null : { ...save, sensitiveModel: null },
    ids,
  );
}
