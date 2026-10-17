import type { NewSave, Source } from "@pond/schema/db";
import { domainFromUrl } from "@pond/schema/domain";
import { majorityMediaType } from "@pond/schema/media-type";
import { walkCaptureMedia } from "@pond/schema/raw";
import log from "electron-log/main.js";
import type { TransferOptions } from "../../../lib/download-transfer";
import { persistSave } from "../../persist-save";
import { captureFromSource } from "../../refresh/harvest/capture";
import { extractorFor, resolveExtractor } from "../extractors";
import type { Capture, RawJson } from "../extractors/types";
import { isFreshHarvest } from "../harvest-freshness";
import { applyImportFilter } from "../import-filter";
import { readSave } from "./apply";

interface HarvestPayload {
  force?: boolean;
}

export async function runHarvestMetadata(
  saveId: string,
  payload: HarvestPayload = {},
  ctx: TransferOptions = {},
): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;

  if (!payload.force && isFreshHarvest(save.rawJson)) {
    log.debug(
      "[pond pipeline:harvest] fresh capture present, skipping",
      saveId,
    );
    await applyImportFilter(save);
    return;
  }

  const extractor = extractorFor(save.source) ?? resolveExtractor(save.url);
  const capture =
    save.source === "web" || save.source === "local"
      ? await extractor.extract({ url: new URL(save.url), signal: ctx.signal })
      : await captureFromSource({
          url: save.url,
          source: save.source,
          sourceId: save.sourceId ?? undefined,
          accountId: save.accountId,
          reportActivity: ctx.reportActivity,
        });

  const rawJson: RawJson = {
    capture,
    extractorId: extractor.id,
    extractedAt: new Date().toISOString(),
  };
  if (save.rawJson?.ytdlp) rawJson.ytdlp = save.rawJson.ytdlp;

  const patch = buildSavePatch(capture, rawJson, save.url, save.source);
  const updated = await persistSave(saveId, patch, {
    actorReason: `harvest:${extractor.id}`,
  });
  log.info("[pond pipeline:harvest] captured", {
    saveId,
    extractor: extractor.id,
    media: walkCaptureMedia(capture).length,
  });
  if (updated) await applyImportFilter(updated);
}

function buildSavePatch(
  capture: Capture,
  rawJson: RawJson,
  pageUrl: string,
  source: Source,
): Partial<NewSave> {
  const media = walkCaptureMedia(capture);
  const mediaUrl = capture.media[0]?.url ?? media[0]?.url ?? null;
  const mediaType =
    source === "web"
      ? "link"
      : majorityMediaType(
          capture.media.map((m) => (m.type === "video" ? "video" : "image")),
        );

  const patch: Partial<NewSave> = {
    rawJson,
    title: capture.title ?? null,
    description: capture.description ?? null,
    author: capture.author?.name ?? capture.author?.handle ?? null,
    lang: capture.lang ?? null,
    publishedAt: capture.publishedAt ? safeDate(capture.publishedAt) : null,
    mediaUrl,
    mediaType,
    siteName: domainFromUrl(pageUrl),
  };
  return patch;
}

function safeDate(value: string): Date | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}
