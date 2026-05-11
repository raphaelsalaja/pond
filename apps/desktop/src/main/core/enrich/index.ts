import {
  type AiSuggestion,
  type AiSuggestionsForSave,
  type EnrichJobKind,
  type NewSave,
  type Save,
  saves as savesTable,
} from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { executeTransaction, registerSyncActionListener } from "../executor";
import { getAiProviderConfig } from "../prefs";
import { extractArticle, summariseArticle } from "./jobs/article";
import { analyseCover } from "./jobs/colors";
import { enrichEmbedding } from "./jobs/embed";
import { enrichVision } from "./jobs/vision";
import { getProviderClient } from "./provider";
import {
  claimNext,
  enqueue,
  enqueueAllMissing,
  markDone,
  markError,
  markSkipped,
  status,
} from "./queue";

/**
 * Enrichment orchestrator. Runs as a single background tick that pulls
 * one job at a time off the persistent queue, executes it, and writes
 * the result through the same `Transaction` executor user edits use.
 *
 * Concurrency is intentionally one-at-a-time for v1 — Local LLMs
 * saturate easily and the queue-aware UI in settings makes the
 * sequential progress feel honest. Bumping to N>1 is a one-line change.
 */

const TICK_MS = 1000;
let tickHandle: NodeJS.Timeout | null = null;
let working = false;
let listenerAttached = false;

/**
 * Start the worker. Idempotent — calling it twice is a no-op. Also
 * subscribes to `sync-action` so newly-created saves auto-enroll.
 */
export function startEnrichWorker(): void {
  attachSyncListener();
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    void tick().catch((err) => log.warn("[pond enrich] tick error", err));
  }, TICK_MS);
}

export function stopEnrichWorker(): void {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function attachSyncListener(): void {
  if (listenerAttached) return;
  listenerAttached = true;
  registerSyncActionListener((action) => {
    if (action.modelName !== "save") return;
    if (action.action === "I" || action.action === "U") {
      void enqueue(action.modelId).catch(() => {
        /* enqueue logs its own warnings */
      });
    }
  });
}

async function tick(): Promise<void> {
  if (working) return;
  const provider = await getAiProviderConfig();
  if (provider.kind === "off") {
    // Even with AI off, we still want to compute dominant colours
    // (always-local, no provider needed). Pull the next colours job
    // only and skip any others.
    const job = await claimNext();
    if (!job) return;
    if (job.kind !== "colors") {
      await markSkipped(job.id, "ai_off");
      return;
    }
    working = true;
    try {
      await runColors(job.id, job.saveId, job.attempts);
    } finally {
      working = false;
    }
    return;
  }
  const job = await claimNext();
  if (!job) return;
  working = true;
  try {
    await runJob(job);
  } finally {
    working = false;
  }
}

async function runJob(job: {
  id: string;
  saveId: string;
  kind: EnrichJobKind;
  attempts: number;
}): Promise<void> {
  const save = await loadSave(job.saveId);
  if (!save) {
    await markSkipped(job.id, "save_not_found");
    return;
  }
  if (save.deletedAt) {
    await markSkipped(job.id, "save_deleted");
    return;
  }
  switch (job.kind) {
    case "colors":
      await runColors(job.id, job.saveId, job.attempts);
      return;
    case "article":
      await runArticle(job, save);
      return;
    case "vision":
      await runVision(job, save);
      return;
    case "embed":
      await runEmbed(job, save);
      return;
  }
}

async function runColors(
  jobId: string,
  saveId: string,
  attempts: number,
): Promise<void> {
  const save = await loadSave(saveId);
  if (!save) {
    await markSkipped(jobId, "save_not_found");
    return;
  }
  const hasColors =
    Array.isArray(save.dominantColors) && save.dominantColors.length > 0;
  const hasBlur =
    typeof save.blurDataUrl === "string" && save.blurDataUrl.length > 0;
  const hasDims =
    typeof save.width === "number" &&
    save.width > 0 &&
    typeof save.height === "number" &&
    save.height > 0;
  if (hasColors && hasBlur && hasDims) {
    await markDone(jobId);
    return;
  }
  try {
    const result = await analyseCover(save);
    if (!result) {
      await markSkipped(jobId, "no_cover");
      return;
    }
    const patch: Partial<NewSave> = {};
    if (!hasColors && result.dominantColors.length > 0) {
      patch.dominantColors = result.dominantColors;
    }
    if (!hasBlur && result.blurDataUrl) {
      patch.blurDataUrl = result.blurDataUrl;
    }
    if (!hasDims && result.width > 0 && result.height > 0) {
      patch.width = result.width;
      patch.height = result.height;
    }
    if (Object.keys(patch).length === 0) {
      await markSkipped(jobId, "no_change");
      return;
    }
    await applyPatch(save, patch, "ai-colors");
    await markDone(jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markError(jobId, attempts, msg);
  }
}

async function runArticle(
  job: { id: string; saveId: string; attempts: number },
  save: Save,
): Promise<void> {
  // Article extraction is local. If we already have HTML cached, skip.
  if (save.articleHtml && save.articleText) {
    await markDone(job.id);
    return;
  }
  if (!save.url) {
    await markSkipped(job.id, "no_url");
    return;
  }
  try {
    const result = await extractArticle(save);
    if (!result) {
      await markSkipped(job.id, "no_content");
      return;
    }
    const patch: Partial<NewSave> = {
      articleHtml: result.html,
      articleText: result.text,
      articleReadingMinutes: result.readingMinutes,
    };
    const client = await getProviderClient();
    if (client) {
      const summary = await summariseArticle(client, result.text);
      if (summary) {
        const append = await maybeAttachSummary(save, summary);
        Object.assign(patch, append);
      }
    }
    await applyPatch(save, patch, "ai-article");
    await markDone(job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markError(job.id, job.attempts, msg);
  }
}

async function runVision(
  job: { id: string; saveId: string; attempts: number },
  save: Save,
): Promise<void> {
  if (save.aiCaption && save.classification) {
    await markDone(job.id);
    return;
  }
  const client = await getProviderClient();
  if (!client) {
    await markSkipped(job.id, "no_provider");
    return;
  }
  if (!client.sendImages && client.kind !== "local") {
    await markSkipped(job.id, "images_disabled");
    return;
  }
  try {
    const result = await enrichVision(client, save);
    if (!result) {
      await markSkipped(job.id, "vision_failed");
      return;
    }
    const patch = await mapVisionToPatch(save, result, client.models.vision);
    if (Object.keys(patch).length === 0) {
      await markSkipped(job.id, "no_change");
      return;
    }
    await applyPatch(save, patch, "ai-vision");
    await markDone(job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markError(job.id, job.attempts, msg);
  }
}

async function runEmbed(
  job: { id: string; saveId: string; attempts: number },
  save: Save,
): Promise<void> {
  // Skip if the embedding is fresh relative to the latest content edit.
  if (
    save.embeddingUpdatedAt &&
    save.embeddingUpdatedAt.getTime() > save.createdAt.getTime() - 1
  ) {
    await markDone(job.id);
    return;
  }
  const client = await getProviderClient();
  if (!client) {
    await markSkipped(job.id, "no_provider");
    return;
  }
  try {
    const result = await enrichEmbedding(client, save);
    if (!result.ok) {
      await markSkipped(job.id, "embed_failed");
      return;
    }
    await applyPatch(save, { embeddingUpdatedAt: new Date() }, "ai-embed");
    await markDone(job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markError(job.id, job.attempts, msg);
  }
}

async function loadSave(id: string): Promise<Save | null> {
  const db = await getDb();
  const rows = await db.select().from(savesTable).where(eq(savesTable.id, id));
  return rows[0] ?? null;
}

/**
 * Compose the AI vision result into a save patch. Honours autonomy:
 *   - `auto` / `auto-apply` → write straight into aiCaption / aiTags / etc.
 *   - `suggest` → write into `aiSuggestions` for inbox review.
 *   - `off` → unreachable; tier-off jobs get skipped before this fn.
 */
async function mapVisionToPatch(
  save: Save,
  vision: import("./jobs/vision").VisionResult,
  modelId: string,
): Promise<Partial<NewSave>> {
  const patch: Partial<NewSave> = {};
  const autonomy = await readAutonomy();
  const now = new Date().toISOString();
  if (autonomy === "off") return patch;
  if (autonomy === "auto" || autonomy === "auto-apply") {
    if (vision.caption && save.aiCaption !== vision.caption) {
      patch.aiCaption = vision.caption;
    }
    if (
      vision.classification &&
      save.classification !== vision.classification
    ) {
      patch.classification = vision.classification;
    }
    if (vision.ocrText && !save.ocrText) {
      patch.ocrText = vision.ocrText;
    }
    if (vision.tags.length > 0) {
      const existing = new Set((save.aiTags ?? []).map((t) => t.toLowerCase()));
      const merged = [...(save.aiTags ?? [])];
      for (const t of vision.tags) {
        if (!existing.has(t.toLowerCase())) {
          merged.push(t);
          existing.add(t.toLowerCase());
        }
      }
      if (merged.length !== (save.aiTags?.length ?? 0)) {
        patch.aiTags = merged;
      }
    }
    return patch;
  }
  const suggestions: AiSuggestionsForSave = {
    ...((save.aiSuggestions as AiSuggestionsForSave | null) ?? {}),
  };
  if (vision.caption) {
    suggestions.caption = mkSuggestion(vision.caption, modelId, now);
  }
  if (vision.classification) {
    suggestions.classification = mkSuggestion(
      vision.classification,
      modelId,
      now,
    );
  }
  if (vision.ocrText) {
    suggestions.ocr = mkSuggestion(vision.ocrText, modelId, now);
  }
  if (vision.tags.length > 0) {
    suggestions.tags = mkSuggestion(vision.tags, modelId, now);
  }
  if (Object.keys(suggestions).length === 0) return patch;
  patch.aiSuggestions = suggestions;
  return patch;
}

function mkSuggestion<T>(
  value: T,
  modelId: string,
  reasoningHint: string,
): AiSuggestion<T> {
  return {
    value,
    appliedAt: null,
    reasoning: `Generated by ${modelId}`,
    promptHash: reasoningHint,
  };
}

async function maybeAttachSummary(
  save: Save,
  summary: string,
): Promise<Partial<NewSave>> {
  const autonomy = await readAutonomy();
  if (autonomy === "off") return {};
  if (autonomy === "auto" || autonomy === "auto-apply") {
    return { aiSummary: summary };
  }
  const suggestions: AiSuggestionsForSave = {
    ...((save.aiSuggestions as AiSuggestionsForSave | null) ?? {}),
    summary: {
      value: summary,
      appliedAt: null,
      reasoning: "article-summary",
    },
  };
  return { aiSuggestions: suggestions };
}

async function readAutonomy(): Promise<string> {
  const db = await getDb();
  const rows = (await db.$raw
    .prepare(`SELECT ai_autonomy FROM settings WHERE id='singleton'`)
    .all()) as Array<{ ai_autonomy: string | null }>;
  if (!rows[0]?.ai_autonomy) return "suggest";
  try {
    const parsed = JSON.parse(rows[0].ai_autonomy) as { tagging?: string };
    return parsed.tagging ?? "suggest";
  } catch {
    return "suggest";
  }
}

async function applyPatch(
  save: Save,
  patch: Partial<NewSave>,
  reason: string,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const before: Partial<Save> = {};
  for (const key of Object.keys(patch) as Array<keyof NewSave>) {
    (before as Record<string, unknown>)[key] = (
      save as unknown as Record<string, unknown>
    )[key];
  }
  const tx: Transaction = {
    kind: "update",
    model: "save",
    id: save.id,
    patch,
    before: before as Partial<Save>,
    meta: { actor: "ai", actorReason: reason },
  };
  await executeTransaction(tx);
}

/** Trigger enrichment for one save, or all unprocessed if id is null. */
export async function startEnrich(
  saveId: string | null,
): Promise<{ ok: true }> {
  if (saveId) {
    await enqueue(saveId);
  } else {
    await enqueueAllMissing();
  }
  startEnrichWorker();
  return { ok: true };
}

export async function enqueueBackfill(): Promise<{ scheduled: number }> {
  startEnrichWorker();
  return await enqueueAllMissing();
}

export async function enrichStatus(): Promise<{
  pending: number;
  running: number;
  done: number;
  error: number;
}> {
  return await status();
}

/**
 * User decision in the inbox: accept or reject one suggestion field. On
 * accept we move the value into the corresponding canonical column;
 * either way we mark `appliedAt` so the inbox can hide the row.
 */
export async function applyAiSuggestion(
  saveId: string,
  field: "tags" | "caption" | "ocr" | "classification" | "summary",
  accept: boolean,
): Promise<{ ok: boolean }> {
  const save = await loadSave(saveId);
  if (!save) return { ok: false };
  const suggestions = (save.aiSuggestions as AiSuggestionsForSave | null) ?? {};
  const entry = suggestions[field];
  if (!entry || entry.appliedAt) return { ok: false };
  const now = new Date().toISOString();
  const patch: Partial<NewSave> = {};
  if (accept) {
    if (field === "caption") patch.aiCaption = entry.value as string;
    if (field === "ocr") patch.ocrText = entry.value as string;
    if (field === "classification") {
      patch.classification = entry.value as Save["classification"];
    }
    if (field === "summary") patch.aiSummary = entry.value as string;
    if (field === "tags") {
      const incoming = (entry.value as string[]) ?? [];
      const existing = new Set((save.aiTags ?? []).map((t) => t.toLowerCase()));
      const merged = [...(save.aiTags ?? [])];
      for (const t of incoming) {
        if (!existing.has(t.toLowerCase())) merged.push(t);
      }
      patch.aiTags = merged;
    }
  }
  patch.aiSuggestions = {
    ...suggestions,
    [field]: { ...entry, appliedAt: accept ? now : `rejected:${now}` },
  } as AiSuggestionsForSave;
  await applyPatch(save, patch, `inbox-${accept ? "accept" : "reject"}`);
  return { ok: true };
}
