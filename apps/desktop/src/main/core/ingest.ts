import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import type { NewSave, Save, SaveFile } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import type { IngestPayload, IngestResponse } from "@pond/schema/ingest";
import type { Transaction, TxSaveFile } from "@pond/schema/tx";
import { and, eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../db";
import {
  fetchAvatarToTxFile,
  fetchMediaBatch,
  readLocalPosterToTxFile,
  readLocalToTxFile,
} from "../lib/blob";
import { inferKindFromFilename } from "../lib/library";
import { itemFile } from "../paths";
import { executeTransaction } from "./executor";
import { enqueuePosterBackfill } from "./poster-backfill";
import { getPrefs } from "./prefs";
import { recordForUndo } from "./undo";

/**
 * HTTP ingest pipeline — called from `/api/v2/item/add`. Turns the Zod
 * payload into a `Transaction` and hands it to the executor so the exact
 * same code path runs whether the save came from the extension, the
 * command palette, or a future CLI.
 *
 * Dedup behaviour:
 *  - No existing `(source, source_id)` row → create a new save.
 *  - Existing row → merge-update: richer fields from the new payload
 *    overwrite nulls/empties, tags union together, and the media set is
 *    re-fetched if the URLs differ. This lets a user re-bookmark the
 *    same post after the scrapers improve and see the new metadata
 *    flow in without losing their notes / archive state.
 */
/**
 * Optional second argument to `ingestFromHttp`. Used by the in-app
 * refresh path to attach files that already live on disk (e.g. a video
 * downloaded by yt-dlp) so they ride into the same `update` tx as the
 * URL-based media. The HTTP `/api/v2/item/add` route handler does NOT
 * accept this — letting an external caller specify arbitrary local
 * paths would be a remote-file-read vector.
 */
export interface LocalIngestExtras {
  /**
   * Pre-downloaded files to materialise alongside the URL-fetched
   * media. Each entry is read with `readLocalToTxFile`; the caller
   * is responsible for cleaning up the source paths after ingest
   * (typically by closing yt-dlp's tmpdir).
   *
   * `kind: "poster"` reroutes the entry through
   * `readLocalPosterToTxFile` so the produced TxSaveFile lands with a
   * `poster.<ext>` filename — used by the ffmpeg first-frame extractor
   * to inject a generated still alongside the yt-dlp video.
   */
  mediaFiles?: Array<{
    path: string;
    mimeType?: string;
    kind?: "poster";
  }>;
  /**
   * Override the merge heuristic in `refreshExisting` so the local
   * `mediaFiles` always replace whatever's currently stored.
   *
   * Used by the auto-heal path: when a `<video>` errors at render time
   * (e.g. an AV1 file we can't decode in Electron's bundled ffmpeg),
   * the renderer asks main to redownload with the corrected H.264
   * selector. The DB row already has a `kind=video` SaveFile pointing
   * at a real-but-unplayable path on disk, so the usual "differs /
   * hasMissingFiles / missingVideoButHaveOne" gates would short-circuit
   * the merge and leave the bad bytes in place. `force: true` skips
   * those gates and writes the fresh bytes unconditionally.
   */
  force?: boolean;
}

export async function ingestFromHttp(
  payload: IngestPayload,
  extras: LocalIngestExtras = {},
): Promise<IngestResponse> {
  const _db = await getDb();

  const prefs = await getPrefs();

  // Source dedup is always (source, sourceId) — that's what makes a
  // re-bookmark merge into the existing row. The `dedupeByUrl` knob
  // *also* checks for an existing row with a matching URL when
  // (source, sourceId) misses, so two extensions saving the same
  // article via different sourceIds collapse into one save.
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
  const saveFiles = filesToSaveFiles(files);

  // blobUrl / fileSize intentionally track the first *media* file, not the
  // avatar — the grid thumbnail and card-chrome expect a real cover.
  const primaryFilename = mediaFiles[0]?.filename ?? null;
  const blobUrl = primaryFilename ? `pond://${id}/${primaryFilename}` : null;

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
    blobUrl,
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
    width: null,
    height: null,
    fileSize: mediaFiles[0] ? sizeOfBase64(mediaFiles[0].base64) : null,
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

  // If the brand-new save has a video file but no generated poster
  // (direct-mp4 path — extension hands us a playable URL straight
  // away without going through yt-dlp, so the auto-video frame
  // extraction never ran), queue a background ffmpeg pass so the
  // grid card eventually shows a real first frame instead of the
  // platform-supplied cover.
  if (needsPosterBackfill(saveFiles)) {
    enqueuePosterBackfill(id);
  }

  return { id, created: true };
}

/**
 * Merge a fresh capture into an existing save. We only touch fields that
 * have a strictly "better" new value so the user's manual edits (title
 * tweaks, notes, custom tags) never get clobbered by a re-bookmark.
 */
async function refreshExisting(
  current: Save,
  payload: IngestPayload,
  requestedUrls: string[],
  avatarUrl: string | null,
  extras: LocalIngestExtras = {},
): Promise<IngestResponse> {
  const patch: Partial<NewSave> = {};

  if (isRicherText(payload.title, current.title)) patch.title = payload.title;
  if (isRicherText(payload.description, current.description))
    patch.description = payload.description;
  if (isRicherText(payload.author, current.author))
    patch.author = payload.author;
  if (!current.url && payload.url) patch.url = payload.url;
  if (payload.mediaType && payload.mediaType !== current.mediaType)
    patch.mediaType = payload.mediaType;
  if (!current.mediaUrl && payload.mediaUrl) patch.mediaUrl = payload.mediaUrl;

  // Phase-4 universal fields. Only fill when blank — user edits never
  // get clobbered. `publishedAt` is treated as authoritative if the
  // existing row carries no value or the new value is older (an
  // earlier timestamp typically means we picked up a more accurate
  // upstream date than the prior heuristic).
  const universal = extractUniversalFields(payload);
  if (!current.lang && universal.lang) patch.lang = universal.lang;
  if (!current.siteName && universal.siteName) {
    patch.siteName = universal.siteName;
  }
  if (universal.publishedAt) {
    if (!current.publishedAt || universal.publishedAt < current.publishedAt) {
      patch.publishedAt = universal.publishedAt;
    }
  }

  // Merge `raw` top-level keys into existing `rawJson` so re-captures
  // can upgrade an older row with richer source-specific metadata
  // (e.g. adding `twitter: { authorName, authorAvatar, ... }` to a
  // pre-scraper-upgrade row whose only had `{ kind, capturedAt }`).
  // We only write a patch if the merge actually produces something
  // different, so repeat captures don't churn sync actions.
  const mergedRaw = mergeRawJson(current.rawJson, payload.raw);
  if (mergedRaw.changed) patch.rawJson = mergedRaw.value;

  if (payload.tags && payload.tags.length > 0) {
    const merged = Array.from(
      new Set([...(current.tags ?? []), ...payload.tags]),
    );
    if (merged.length !== (current.tags?.length ?? 0)) patch.tags = merged;
  }

  // Media re-fetch: only if the incoming URL set actually differs from
  // what we stored last time. We stash the source URLs on `rawJson` so a
  // future run can compare without re-downloading; existing rows fall
  // back to "any new set with items triggers a refetch".
  //
  // Avatar policy: if we're already rewriting `files` because media
  // changed, piggyback a fresh avatar fetch. We skip avatar-only refreshes
  // for now — the executor's update path replaces the whole files[] set
  // per-write, so a solo avatar add would silently drop existing media.
  // Older rows missing avatars stay as letter-fallbacks until they're
  // re-captured via a meaningful change.
  //
  // Local files (yt-dlp output): always trigger a re-fetch when present.
  // The video bytes don't have a URL we can compare against, so we treat
  // any non-empty `extras.mediaFiles` as a strict signal that the user
  // explicitly wants the video materialised on disk (typically because
  // they just clicked Refresh on a broken video card).
  let files: TxSaveFile[] | undefined;
  const hasLocalFiles =
    extras.mediaFiles !== undefined && extras.mediaFiles.length > 0;
  if (requestedUrls.length > 0 || hasLocalFiles) {
    const prevUrls = extractPreviousMediaUrls(current);
    const differs = !arraysEqual(prevUrls, requestedUrls);
    // Force a re-fetch when the row has no files at all even if the
    // incoming URL set matches what we last stored — covers the case
    // where the original capture failed to download the bytes (broken
    // CDN link at save-time, network blip, etc.) so a refresh actually
    // recovers the missing cover instead of silently skipping it.
    const hasNoStoredFiles = !current.files || current.files.length === 0;
    // Also force a re-fetch when the DB row claims to have files but
    // their bytes are missing on disk — happens when a previous write
    // committed the metadata transaction but never landed the blob
    // (interrupted refresh, library directory deleted out from under
    // us, restored backup with a stale items dir, etc.). Without this
    // the renderer keeps requesting `pond://<id>/cover.jpg` and gets a
    // 404 forever because nothing triggers a heal.
    const hasMissingFiles =
      !hasNoStoredFiles && (await anyFileMissing(current.id, current.files));
    // Treat the absence of any stored video file as "needs heal" when
    // the caller handed us a local video to write — covers the case
    // where the original poster-only refresh succeeded but no .mp4
    // ever landed on disk, so a follow-up Refresh that downloads the
    // video should always materialise it.
    const missingVideoButHaveOne =
      hasLocalFiles && !current.files?.some((f) => f.kind === "video");
    // `force` is the auto-heal escape hatch — see LocalIngestExtras.
    // We OR it in last so the heuristic still fires for the normal
    // refresh paths and only the explicit redownload IPC bypasses
    // the diff checks.
    const forceLocal = hasLocalFiles && extras.force === true;
    if (
      differs ||
      hasNoStoredFiles ||
      hasMissingFiles ||
      missingVideoButHaveOne ||
      forceLocal
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
      // Pick the cover for the patched row from the URL-fetched media
      // first (since that's the poster JPG), then fall back to the
      // local video bytes when there was no URL media (rare — happens
      // for sources where the harvester couldn't extract a poster but
      // yt-dlp still landed a video; we use the video itself as cover
      // and the renderer paints its first frame).
      const first = mediaFiles[0] ?? localFiles[0];
      if (first) {
        patch.files = filesToSaveFiles(files);
        patch.coverIndex = 0;
        patch.blobUrl = `pond://${current.id}/${first.filename}`;
        patch.fileSize = sizeOfBase64(first.base64);
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

  // Same backfill trigger as the create branch — covers the case
  // where a refresh writes a new video without a paired generated
  // poster.
  const postFiles = patch.files ?? current.files ?? [];
  if (needsPosterBackfill(postFiles)) {
    enqueuePosterBackfill(current.id);
  }

  return { id: current.id, created: false };
}

function needsPosterBackfill(files: SaveFile[] | null | undefined): boolean {
  if (!files || files.length === 0) return false;
  const hasVideo = files.some((f) => f.kind === "video");
  if (!hasVideo) return false;
  return !files.some((f) => f.kind === "poster");
}

function collectRequestedUrls(payload: IngestPayload): string[] {
  const out: string[] = [];
  if (payload.mediaUrls && payload.mediaUrls.length > 0) {
    for (const m of payload.mediaUrls) {
      out.push(m.url);
      if (m.poster) out.push(m.poster);
    }
  } else if (payload.mediaUrl) {
    out.push(payload.mediaUrl);
  }
  return out;
}

/**
 * Drain `LocalIngestExtras.mediaFiles` into `TxSaveFile` entries. We
 * preserve the input order so the caller (refresh path) can hand us
 * `[poster, video]` and have those land in the same order in the
 * downstream `update` tx, which the renderer then uses to pair the
 * cover with its sibling video.
 *
 * Each entry that fails to read is dropped silently; the executor's
 * write step is all-or-nothing so a partial result here just means
 * the user gets fewer files, not an inconsistent state.
 */
async function readLocalFiles(
  inputs: LocalIngestExtras["mediaFiles"],
): Promise<TxSaveFile[]> {
  if (!inputs || inputs.length === 0) return [];
  // Poster entries are indexed independently of the video/cover slots
  // so multiple posters in one tx still produce `poster.<ext>` /
  // `poster-1.<ext>` instead of colliding with the media indices.
  let posterIndex = 0;
  let mediaIndex = 0;
  const results = await Promise.all(
    inputs.map((f) => {
      if (f.kind === "poster") {
        const i = posterIndex++;
        return readLocalPosterToTxFile(f.path, {
          ...(f.mimeType !== undefined ? { mimeType: f.mimeType } : {}),
          index: i,
        });
      }
      const i = mediaIndex++;
      return readLocalToTxFile(f.path, {
        ...(f.mimeType !== undefined ? { mimeType: f.mimeType } : {}),
        index: i,
      });
    }),
  );
  return results.filter((r): r is TxSaveFile => r !== null);
}

function filesToSaveFiles(files: TxSaveFile[]): SaveFile[] {
  return files.map((f) => ({
    kind: inferKindFromFilename(f.filename),
    path: f.filename,
    sha256: sha256Base64(f.base64),
    size: sizeOfBase64(f.base64),
    mimeType: f.mimeType ?? null,
  }));
}

/**
 * Pull the scraped author avatar URL out of the per-source `raw.<source>`
 * passthrough (see scrapers). Source-agnostic so any new extension
 * entrypoint that sets `raw.<source>.authorAvatar` gets local storage for
 * free. Returns `null` if no avatar was captured.
 */
function extractAvatarUrl(payload: IngestPayload): string | null {
  const raw = payload.raw;
  if (!raw || typeof raw !== "object") return null;
  const container = (raw as Record<string, unknown>)[payload.source];
  if (!container || typeof container !== "object") return null;
  const url = (container as Record<string, unknown>).authorAvatar;
  return typeof url === "string" && url.length > 0 ? url : null;
}

/**
 * Phase-4 universal-field extractor. Reads top-level
 * `payload.{lang,siteName,publishedAt}` first (Zod already coerced
 * `publishedAt` to a Date), falling back to `raw.<source>.<field>`
 * for sources whose harvesters still write the legacy nested shape.
 */
function extractUniversalFields(payload: IngestPayload): {
  lang: string | null;
  siteName: string | null;
  publishedAt: Date | null;
} {
  const raw = payload.raw;
  const container =
    raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>)[payload.source] as
          | Record<string, unknown>
          | undefined)
      : undefined;

  const lang =
    typeof payload.lang === "string" && payload.lang.length > 0
      ? payload.lang
      : typeof container?.lang === "string" && container.lang.length > 0
        ? (container.lang as string)
        : null;
  const siteName =
    typeof payload.siteName === "string" && payload.siteName.length > 0
      ? payload.siteName
      : typeof container?.siteName === "string" && container.siteName.length > 0
        ? (container.siteName as string)
        : null;
  let publishedAt: Date | null =
    payload.publishedAt instanceof Date ? payload.publishedAt : null;
  if (!publishedAt && typeof container?.publishedAt === "string") {
    const parsed = new Date(container.publishedAt as string);
    if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
  }
  return { lang, siteName, publishedAt };
}

/**
 * New text is "richer" if the existing field is null/blank, or if the
 * new value is more informative (longer) than what we have.
 */
function isRicherText(
  next: string | null | undefined,
  current: string | null | undefined,
): next is string {
  if (!next) return false;
  const n = next.trim();
  if (!n) return false;
  const c = (current ?? "").trim();
  if (!c) return true;
  if (n === c) return false;
  return n.length > c.length;
}

/**
 * Capture the "before" shape for the update transaction's inverse. We
 * only need to record keys the patch will change.
 */
function snapshotBefore(current: Save, patch: Partial<NewSave>): Partial<Save> {
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    before[key] = (current as unknown as Record<string, unknown>)[key] ?? null;
  }
  return before as Partial<Save>;
}

function extractPreviousMediaUrls(current: Save): string[] {
  const out: string[] = [];
  const raw = current.rawJson as unknown;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.gallery)) {
      for (const g of r.gallery as Array<Record<string, unknown>>) {
        if (typeof g.url === "string") out.push(g.url);
      }
    }
  }
  if (out.length === 0 && current.mediaUrl) out.push(current.mediaUrl);
  return out;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sha256Base64(base64: string): string {
  return createHash("sha256")
    .update(Buffer.from(base64, "base64"))
    .digest("hex");
}

function sizeOfBase64(base64: string): number {
  return Buffer.byteLength(base64, "base64");
}

/**
 * Shallow-merge two `rawJson` values. New object keys win; values that
 * are themselves objects (e.g. `twitter: { ... }`) get one extra level
 * of merge so adding fresh nested fields doesn't clobber previously
 * stashed ones. Anything non-object is replaced wholesale.
 *
 * `changed` tells the caller whether to actually write the patch — it
 * compares via JSON identity which is fine for the small, flat-ish
 * objects our scrapers emit.
 */
function mergeRawJson(
  current: unknown,
  next: unknown,
): { changed: boolean; value: unknown } {
  if (next === undefined) return { changed: false, value: current };
  if (!isPlainObject(current) || !isPlainObject(next)) {
    const changed = JSON.stringify(current ?? null) !== JSON.stringify(next);
    return { changed, value: next };
  }

  const out: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(next)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = { ...(out[k] as Record<string, unknown>), ...v };
    } else {
      out[k] = v;
    }
  }
  const changed = JSON.stringify(current) !== JSON.stringify(out);
  return { changed, value: out };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Returns true if any of the recorded `SaveFile` entries point at a path
 * that no longer exists on disk. Used by the refresh path so a save
 * whose `<id>.info/` directory was deleted (or whose individual files
 * were nuked) gets its bytes re-downloaded the next time the user hits
 * Refresh, instead of staying broken with a perpetual 404 in the grid.
 *
 * Cheap: bails out on the first missing file rather than `Promise.all`'ing
 * everything. Failure to stat is treated as "missing" so any kind of
 * filesystem hiccup triggers the heal path conservatively.
 */
async function anyFileMissing(id: string, files: SaveFile[]): Promise<boolean> {
  for (const f of files) {
    try {
      await access(itemFile(id, f.path));
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * Lookup an existing save row by `(source, sourceId)`. When
 * `dedupeByUrl` is on, also tries an exact URL match in case the
 * scrapers across sources can't agree on a canonical id (e.g. a
 * Twitter status URL saved under different sources).
 */
async function findExisting(
  payload: IngestPayload,
  dedupeByUrl: boolean,
): Promise<Save | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(saves)
    .where(
      and(
        eq(saves.source, payload.source),
        eq(saves.sourceId, payload.sourceId),
      ),
    )
    .limit(1);
  if (rows[0]) return rows[0];
  if (!dedupeByUrl) return null;
  const byUrl = await db
    .select()
    .from(saves)
    .where(eq(saves.url, payload.url))
    .limit(1);
  return byUrl[0] ?? null;
}

function mergeUnique(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [...a, ...b]) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}
