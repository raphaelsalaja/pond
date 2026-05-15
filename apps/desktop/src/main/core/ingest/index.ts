import type { NewSave, Save } from "@pond/schema/db";
import type { IngestPayload, IngestResponse } from "@pond/schema/ingest";
import type { Transaction, TxSaveFile } from "@pond/schema/tx";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { fetchAvatarToTxFile, fetchMediaBatch } from "../../lib/blob";
import { executeTransaction } from "../executor";
import { enqueuePosterBackfill } from "../poster-backfill";
import { getPrefs } from "../prefs";
import { recordForUndo } from "../undo";
import { findExisting } from "./dedupe";
import {
  anyFileMissing,
  filesToSaveFiles,
  needsPosterBackfill,
  readLocalFiles,
} from "./files";
import {
  arraysEqual,
  mergeRawJson,
  mergeUnique,
  snapshotBefore,
} from "./merge";
import {
  collectRequestedUrls,
  extractAvatarUrl,
  extractPreviousMediaUrls,
  extractUniversalFields,
  isAuthoritativeText,
  isRicherText,
  pickCoverDims,
} from "./payload";
import type { LocalIngestExtras } from "./types";

export type { LocalIngestExtras } from "./types";

export async function ingestFromHttp(
  payload: IngestPayload,
  extras: LocalIngestExtras = {},
): Promise<IngestResponse> {
  const prefs = await getPrefs();
  const existing = await findExisting(payload, prefs.saveBehavior.dedupeByUrl);
  const requestedUrls = collectRequestedUrls(payload);
  const avatarUrl = extractAvatarUrl(payload);

  if (existing) {
    return refreshExisting(existing, payload, requestedUrls, avatarUrl, extras);
  }

  const id = ulid();
  const mediaFiles: TxSaveFile[] = await fetchMediaBatch(requestedUrls);
  const localFiles: TxSaveFile[] = await readLocalFiles(extras.mediaFiles);
  const avatarFile: TxSaveFile | null = avatarUrl
    ? await fetchAvatarToTxFile(avatarUrl)
    : null;
  const files: TxSaveFile[] = [
    ...mediaFiles,
    ...localFiles,
    ...(avatarFile ? [avatarFile] : []),
  ];
  const coverDims = pickCoverDims(payload, extras);
  const saveFiles = filesToSaveFiles(files, coverDims);

  const savedAt = payload.savedAt ? new Date(payload.savedAt) : new Date();
  const universal = extractUniversalFields(payload);
  const newSave: NewSave = {
    id,
    source: payload.source,
    sourceId: payload.sourceId,
    url: payload.url,
    title: payload.title ?? null,
    description: payload.description ?? null,
    author: payload.author ?? null,
    lang: universal.lang,
    siteName: universal.siteName,
    publishedAt: universal.publishedAt,
    notes: null,
    mediaUrl: payload.mediaUrl ?? null,
    mediaType: payload.mediaType ?? null,
    rawJson: payload.raw ?? null,
    tags: mergeUnique(prefs.saveBehavior.defaultTags, payload.tags ?? []),
    aiTags: [],
    aiCaption: null,
    aiSuggestions: null,
    ocrText: null,
    dominantColors: null,
    blurDataUrl: null,
    coverIndex: 0,
    width: coverDims?.width ?? null,
    height: coverDims?.height ?? null,
    fileSize: mediaFiles[0]?.bytes.byteLength ?? null,
    files: saveFiles,
    archivedAt: null,
    deletedAt: null,
    embeddingUpdatedAt: null,
    savedAt,
    createdAt: new Date(),
  };

  const tx: Transaction = {
    kind: "create",
    model: "save",
    id,
    data: newSave,
    files,
    meta: { actor: "user", actorReason: "http-ingest" },
  };

  await executeTransaction(tx);
  recordForUndo(tx);

  if (needsPosterBackfill(saveFiles)) {
    enqueuePosterBackfill(id);
  }

  return { id, created: true };
}

async function refreshExisting(
  current: Save,
  payload: IngestPayload,
  requestedUrls: string[],
  avatarUrl: string | null,
  extras: LocalIngestExtras = {},
): Promise<IngestResponse> {
  const patch: Partial<NewSave> = {};
  const trust = extras.trustAuthoritative === true;

  if (trust) {
    if (isAuthoritativeText(payload.title, current.title)) {
      patch.title = payload.title;
    }
    if (isAuthoritativeText(payload.description, current.description)) {
      patch.description = payload.description;
    }
    if (isAuthoritativeText(payload.author, current.author)) {
      patch.author = payload.author;
    }
    if (payload.mediaUrl && payload.mediaUrl !== current.mediaUrl) {
      patch.mediaUrl = payload.mediaUrl;
    }
    if (payload.mediaType && payload.mediaType !== current.mediaType) {
      patch.mediaType = payload.mediaType;
    }
  } else {
    if (isRicherText(payload.title, current.title)) patch.title = payload.title;
    if (isRicherText(payload.description, current.description))
      patch.description = payload.description;
    if (isRicherText(payload.author, current.author))
      patch.author = payload.author;
    if (payload.mediaType && payload.mediaType !== current.mediaType)
      patch.mediaType = payload.mediaType;
    if (!current.mediaUrl && payload.mediaUrl)
      patch.mediaUrl = payload.mediaUrl;
  }
  if (!current.url && payload.url) patch.url = payload.url;

  const universal = extractUniversalFields(payload);
  if (!current.lang && universal.lang) patch.lang = universal.lang;
  if (!current.siteName && universal.siteName) {
    patch.siteName = universal.siteName;
  }
  if (universal.publishedAt) {
    if (
      !current.publishedAt ||
      trust ||
      universal.publishedAt < current.publishedAt
    ) {
      patch.publishedAt = universal.publishedAt;
    }
  }

  const mergedRaw = mergeRawJson(current.rawJson, payload.raw);
  if (mergedRaw.changed) patch.rawJson = mergedRaw.value;

  if (payload.tags && payload.tags.length > 0) {
    const merged = Array.from(
      new Set([...(current.tags ?? []), ...payload.tags]),
    );
    if (merged.length !== (current.tags?.length ?? 0)) patch.tags = merged;
  }

  let files: TxSaveFile[] | undefined;
  const hasLocalFiles =
    extras.mediaFiles !== undefined && extras.mediaFiles.length > 0;
  const missingAvatar =
    avatarUrl !== null &&
    !(current.files ?? []).some((f) => f.kind === "avatar");
  if (requestedUrls.length > 0 || hasLocalFiles || missingAvatar) {
    const prevUrls = extractPreviousMediaUrls(current);
    const differs = !arraysEqual(prevUrls, requestedUrls);
    const hasNoStoredFiles = !current.files || current.files.length === 0;
    const hasMissingFiles =
      !hasNoStoredFiles && (await anyFileMissing(current.id, current.files));
    const missingVideoButHaveOne =
      hasLocalFiles && !current.files?.some((f) => f.kind === "video");
    const forceLocal = hasLocalFiles && extras.force === true;
    const forceTrust =
      trust &&
      payload.mediaUrl != null &&
      payload.mediaUrl !== current.mediaUrl;
    if (
      differs ||
      hasNoStoredFiles ||
      hasMissingFiles ||
      missingVideoButHaveOne ||
      forceLocal ||
      forceTrust ||
      missingAvatar
    ) {
      if (hasMissingFiles) {
        log.info(
          "[pond ingest] healing missing on-disk files",
          current.id,
          current.files.map((f) => f.path),
        );
      }
      const mediaFiles = await fetchMediaBatch(requestedUrls);
      const localFiles = await readLocalFiles(extras.mediaFiles);
      const avatarFile =
        avatarUrl !== null ? await fetchAvatarToTxFile(avatarUrl) : null;
      files = [
        ...mediaFiles,
        ...localFiles,
        ...(avatarFile ? [avatarFile] : []),
      ];
      const first = mediaFiles[0] ?? localFiles[0];
      if (first) {
        const coverDims = pickCoverDims(payload, extras);
        patch.files = filesToSaveFiles(files, coverDims);
        patch.coverIndex = 0;
        patch.fileSize = first.bytes.byteLength;
        if (coverDims) {
          patch.width = coverDims.width;
          patch.height = coverDims.height;
        }
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    log.info(
      "[pond ingest] duplicate; no richer fields in payload",
      payload.source,
      payload.sourceId,
      current.id,
    );
    return { id: current.id, created: false };
  }

  log.info(
    "[pond ingest] merging update into existing save",
    current.id,
    Object.keys(patch),
  );

  const tx: Transaction = {
    kind: "update",
    model: "save",
    id: current.id,
    patch,
    before: snapshotBefore(current, patch),
    ...(files ? { files } : {}),
    meta: { actor: "user", actorReason: "http-ingest-refresh" },
  };

  await executeTransaction(tx);
  recordForUndo(tx);

  const postFiles = patch.files ?? current.files ?? [];
  if (needsPosterBackfill(postFiles)) {
    enqueuePosterBackfill(current.id);
  }

  return { id: current.id, created: false };
}
