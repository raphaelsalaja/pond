import type { Source } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import type { IngestPayload } from "@pond/schema/ingest";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { ingestFromHttp, type LocalIngestExtras } from "../ingest";
import { refreshFromOgTags } from "./og";
import { harvestUrl, isSourceConnected } from "./scrape-window";
import { classifyUrl, supportsYtDlp } from "./sources";
import { downloadVideo } from "./yt-dlp";

/**
 * In-app refresh path for a single saved item. Replaces the old
 * "open-in-browser → re-bookmark" flow for everything we can scrape
 * without bouncing the user out.
 *
 * Strategy, per save:
 *   1. If the URL is non-auth-walled, try the cheap server-side OG
 *      reader first. Fast (single fetch), no Chromium spin-up, works
 *      for any blog / news / GitHub / YouTube watch page.
 *   2. If that fails or the URL *is* auth-walled, hand off to the
 *      hidden BrowserWindow so the source-specific harvester can scrape
 *      the rendered DOM with the user's logged-in cookies.
 *   3. If the hidden window comes back with `auth_required`, surface
 *      that so the renderer can prompt the user to "Connect <source>"
 *      from settings.
 *
 * In every success branch we route the result through `ingestFromHttp`,
 * which already does the merge-on-duplicate dance — user edits, notes,
 * and tags are preserved while richer scraped fields land in null/blank
 * columns.
 */

export type RefreshOutcome =
  | {
      ok: true;
      method: "og" | "hidden-window";
      created: boolean;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "no_url"
        | "no_metadata"
        | "auth_required"
        | "blocked"
        | "internal_error";
      /** When `auth_required`, the source the user should connect to. */
      source?: Source;
    };

export async function refreshSave(saveId: string): Promise<RefreshOutcome> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, saveId));
  const current = rows[0];
  if (!current) return { ok: false, reason: "not_found" };
  if (!current.url) return { ok: false, reason: "no_url" };

  const { source: classified, authWalled } = classifyUrl(current.url);
  // Trust the existing row's source over the URL classifier — the
  // user might have edited the URL and we still want to merge into the
  // same record. Same for sourceId.
  const source: Source = current.source;
  const sourceId = current.sourceId;

  // -- Stage 1: server-side OG fetch (skip for known auth-walled hosts) --
  if (!authWalled) {
    const og = await refreshFromOgTags({
      url: current.url,
      source,
      sourceId,
    });
    if (og.ok && og.payload) {
      // OG path doesn't tell us much about the page's video; we still
      // attempt yt-dlp when the source allow-lists it because the
      // metadata reader gave us no media at all OR a `video` mediaType
      // (most public YouTube watch pages, public Twitter video links).
      const ytdlpExtras = await maybeDownloadVideo({
        url: current.url,
        classified,
        mediaType: og.payload.mediaType ?? null,
        hasMediaUrls:
          (og.payload.mediaUrls?.length ?? 0) > 0 ||
          Boolean(og.payload.mediaUrl),
      });
      try {
        const result = await ingestFromHttp(og.payload, {
          mediaFiles: ytdlpExtras?.mediaFiles,
          // User-initiated refresh: when yt-dlp produced new bytes,
          // always overwrite. Without `force: true` the merge in
          // `refreshExisting` short-circuits whenever the row already
          // has a (broken) video file on disk — see the codec-heal
          // path comments on LocalIngestExtras.
          force: ytdlpExtras !== null,
        });
        await ytdlpExtras?.cleanup();
        return { ok: true, method: "og", created: result.created };
      } catch (err) {
        await ytdlpExtras?.cleanup();
        log.warn("[pond refresh] og ingest threw", err);
      }
    }
  }

  // -- Stage 2: hidden BrowserWindow harvester ---------------------------
  const harvest = await harvestUrl({
    url: current.url,
    source: classified,
    sourceId,
  });

  if (!harvest.ok) {
    if (harvest.reason === "auth_required" && classified) {
      const connected = await isSourceConnected(classified).catch(() => false);
      // Even if we *think* we're connected, we still got bounced — the
      // session expired. Surface as auth_required so the user can
      // re-connect.
      log.info(
        "[pond refresh] hidden window auth_required",
        current.url,
        connected ? "(was connected)" : "(never connected)",
      );
      return { ok: false, reason: "auth_required", source: classified };
    }
    if (harvest.reason === "navigate_failed") {
      return { ok: false, reason: "blocked" };
    }
    return { ok: false, reason: "no_metadata" };
  }

  const payload: IngestPayload = {
    source,
    sourceId,
    url: current.url,
    title: harvest.harvest?.title,
    description: harvest.harvest?.description,
    author: harvest.harvest?.author,
    mediaUrl: harvest.harvest?.mediaUrl,
    mediaUrls: harvest.harvest?.mediaUrls,
    mediaType: harvest.harvest?.mediaType,
    raw: {
      kind: "in-app-refresh",
      capturedAt: new Date().toISOString(),
      ...(harvest.harvest?.meta ? { [source]: harvest.harvest.meta } : {}),
    },
  };

  // Stage 2.5 — hand the page to yt-dlp when the source supports it.
  // Runs in parallel with no harm if the page turns out to have no
  // video; yt-dlp returns null and we fall through to the existing
  // poster-only ingest. We pass the harvested mediaType so the helper
  // can short-circuit for tweets/posts/elements that the harvester
  // already classified as a still image.
  const ytdlpExtras = await maybeDownloadVideo({
    url: current.url,
    classified,
    mediaType: payload.mediaType ?? null,
    hasMediaUrls: (payload.mediaUrls?.length ?? 0) > 0,
  });

  try {
    const result = await ingestFromHttp(payload, {
      mediaFiles: ytdlpExtras?.mediaFiles,
      // Same reasoning as the OG branch above: when yt-dlp landed
      // fresh bytes for an explicit user refresh, always replace the
      // current on-disk video — the user's intent is "give me what's
      // there now", which overrides the merge heuristic.
      force: ytdlpExtras !== null,
    });
    await ytdlpExtras?.cleanup();
    return { ok: true, method: "hidden-window", created: result.created };
  } catch (err) {
    await ytdlpExtras?.cleanup();
    log.error("[pond refresh] hidden-window ingest threw", err);
    return { ok: false, reason: "internal_error" };
  }
}

/**
 * Decide whether to invoke yt-dlp for this URL, and if so, do it.
 *
 * Heuristic:
 *  - Source must be in the per-source `supportsYtDlp` allowlist.
 *  - We attempt yt-dlp when the harvest reported a video mediaType,
 *    OR when there's no media at all (some public YT / Twitter URLs
 *    refresh through the OG path before we ever see a `mediaType`).
 *    For pages that the harvester already proved are photos (e.g.
 *    `mediaType === "image"` with non-empty mediaUrls) we skip yt-dlp
 *    entirely so we don't spend 5-10s spinning up the binary on every
 *    photo refresh.
 *  - yt-dlp exit-non-zero / timeout / file-too-big returns `null` from
 *    `downloadVideo`, which we surface as "no extras" — never a failure.
 *
 * Returns a `LocalIngestExtras` plus a `cleanup` callback the caller
 * MUST invoke after `ingestFromHttp` resolves so we don't leak the
 * tmpdir.
 */
async function maybeDownloadVideo(args: {
  url: string;
  classified: Source | null;
  mediaType: string | null;
  hasMediaUrls: boolean;
}): Promise<
  | (Required<Pick<LocalIngestExtras, "mediaFiles">> & {
      cleanup: () => Promise<void>;
    })
  | null
> {
  if (!supportsYtDlp(args.classified)) return null;
  // Skip when the harvester already proved this is a photo / album.
  // For unknown / no-media pages we still try because the harvester
  // sometimes whiffs on video-only tweets that load late.
  if (
    args.mediaType &&
    args.mediaType !== "video" &&
    args.mediaType !== "link" &&
    args.hasMediaUrls
  ) {
    return null;
  }
  const result = await downloadVideo({
    url: args.url,
    source: args.classified,
  });
  if (!result) return null;
  return {
    mediaFiles: [{ path: result.path, mimeType: result.mimeType }],
    cleanup: result.cleanup,
  };
}

export {
  disconnectSource,
  isSourceConnected,
  signInToSource,
} from "./scrape-window";
