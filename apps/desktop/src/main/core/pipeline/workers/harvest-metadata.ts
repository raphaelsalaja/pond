import { type NewSave, type Source, tasks } from "@pond/schema/db";
import { domainFromUrl } from "@pond/schema/domain";
import { majorityMediaType } from "@pond/schema/media-type";
import { walkCaptureMedia } from "@pond/schema/raw";
import { arenaLinkUrl, isWebPageSave } from "@shared/web-page-save";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../../../db";
import type { TransferOptions } from "../../../lib/download-transfer";
import { persistSave } from "../../persist-save";
import { captureFromSource } from "../../refresh/harvest/capture";
import { isPartitionSignedIn } from "../../refresh/harvest-window/session";
import { extractorFor, resolveExtractor } from "../extractors";
import type { Capture, RawJson } from "../extractors/types";
import { isFreshHarvest } from "../harvest-freshness";
import { applyImportFilter, applyListFilter } from "../import-filter";
import { maxAttemptsFor } from "../specs";
import { saveAuthorFrom, withYtdlpAuthor } from "../ytdlp-author";
import { readSave } from "./apply";
import { splitArticle } from "./article-document";

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
  if (await applyListFilter(save)) return;

  const extractor = extractorFor(save.source) ?? resolveExtractor(save.url);
  const harvested =
    save.source === "web" || save.source === "local"
      ? await extractor.extract({ url: new URL(save.url), signal: ctx.signal })
      : await captureFromSource({
          url: save.url,
          source: save.source,
          sourceId: save.sourceId ?? undefined,
          accountId: save.accountId,
          reportActivity: ctx.reportActivity,
          isSignedIn: isPartitionSignedIn,
          signal: ctx.signal,
        });
  const { capture, files } = splitArticle(
    withYtdlpAuthor(harvested, save.rawJson?.ytdlp),
  );

  const rawJson: RawJson = {
    capture,
    extractorId: extractor.id,
    extractedAt: new Date().toISOString(),
  };
  if (save.rawJson?.ytdlp) rawJson.ytdlp = save.rawJson.ytdlp;

  const pageUrl = arenaLinkUrl(capture) ?? save.url;
  const patch = buildSavePatch(capture, rawJson, pageUrl, save.source);
  if (pageUrl !== save.url) patch.url = pageUrl;
  const updated = await persistSave(saveId, patch, {
    actorReason: `harvest:${extractor.id}`,
    ...files,
  });
  if (save.source !== "web" && isWebPageSave({ ...save, url: pageUrl })) {
    await addArchiveTask(saveId);
  }
  log.info("[pond pipeline:harvest] captured", {
    saveId,
    extractor: extractor.id,
    media: walkCaptureMedia(capture).length,
  });
  if (updated) await applyImportFilter(updated);
}

/** Charged to the web budget: the archive loads the linked site, so its failures must not trip the harvesting Source's breaker. */
async function addArchiveTask(saveId: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  db.insert(tasks)
    .values({
      id: ulid(),
      saveId,
      source: "web",
      op: "archive_page",
      status: "pending",
      attempts: 0,
      maxAttempts: maxAttemptsFor("archive_page"),
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

function buildSavePatch(
  capture: Capture,
  rawJson: RawJson,
  pageUrl: string,
  source: Source,
): Partial<NewSave> {
  const media = walkCaptureMedia(capture);
  const mediaUrl = capture.media[0]?.url ?? media[0]?.url ?? null;
  const mediaType = isWebPageSave({ source, url: pageUrl })
    ? "link"
    : majorityMediaType(
        capture.media.map((m) => (m.type === "video" ? "video" : "image")),
      );

  const patch: Partial<NewSave> = {
    rawJson,
    title: capture.title ?? null,
    description: capture.description ?? null,
    author: saveAuthorFrom(capture),
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
