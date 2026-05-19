import type { MediaType, NewSave } from "@pond/schema/db";
import log from "electron-log/main.js";
import { resolveExtractor } from "../extractors";
import type { Capture, RawJson } from "../extractors/types";
import { applySavePatch, readSave } from "./apply";

const HARVEST_FRESH_MS = 24 * 60 * 60 * 1000;

export interface HarvestPayload {
  force?: boolean;
}

export async function runHarvestMetadata(
  saveId: string,
  payload: HarvestPayload = {},
): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;

  // Self-gate: skip when a fresh capture already lives in rawJson and the
  // task wasn't triggered with force (e.g. by the refresh button).
  if (!payload.force && isFreshHarvest(save.rawJson)) {
    log.debug(
      "[pond pipeline:harvest] fresh capture present, skipping",
      saveId,
    );
    return;
  }

  const extractor = resolveExtractor(save.url);
  const url = new URL(save.url);
  const capture = await extractor.extract({ url });

  const existingRaw =
    save.rawJson && typeof save.rawJson === "object"
      ? (save.rawJson as RawJson)
      : null;

  const rawJson: RawJson = {
    capture,
    extractorId: extractor.id,
    extractedAt: new Date().toISOString(),
    ...(existingRaw?.ytdlp ? { ytdlp: existingRaw.ytdlp } : {}),
  };

  const patch = buildSavePatch(capture, rawJson);
  await applySavePatch(saveId, patch, {
    actorReason: `harvest:${extractor.id}`,
  });
  log.info("[pond pipeline:harvest] captured", {
    saveId,
    extractor: extractor.id,
    media: capture.media.length,
  });
}

function isFreshHarvest(rawJson: unknown): boolean {
  if (!rawJson || typeof rawJson !== "object") return false;
  const v = rawJson as { extractedAt?: unknown; capture?: unknown };
  if (typeof v.extractedAt !== "string" || !v.capture) return false;
  const ms = Date.parse(v.extractedAt);
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms < HARVEST_FRESH_MS;
}

function buildSavePatch(capture: Capture, rawJson: RawJson): Partial<NewSave> {
  const mediaUrl = capture.media[0]?.url ?? null;
  const mediaType = pickMediaType(capture);

  const patch: Partial<NewSave> = {
    rawJson,
    title: capture.title ?? null,
    description: capture.description ?? null,
    author: capture.author?.name ?? capture.author?.handle ?? null,
    lang: capture.lang ?? null,
    publishedAt: capture.publishedAt ? safeDate(capture.publishedAt) : null,
    mediaUrl,
    mediaType,
  };
  return patch;
}

function safeDate(value: string): Date | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

// "mixed" when the capture is a carousel with both videos and images
// (Instagram interleaved posts, Twitter threads with mixed media). Falls
// back to image/video by majority for single-type carousels.
function pickMediaType(capture: Capture): MediaType | null {
  const media = capture.media ?? [];
  if (media.length === 0) return null;
  let videos = 0;
  let images = 0;
  for (const m of media) {
    if (m.type === "video") videos++;
    else images++;
  }
  if (videos > 0 && images > 0) return "mixed";
  return videos > images ? "video" : "image";
}
