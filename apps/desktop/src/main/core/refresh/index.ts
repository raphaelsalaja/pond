import type { Source } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import type { IngestPayload } from "@pond/schema/ingest";
import type { Transaction } from "@pond/schema/tx";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { executeTransaction } from "../executor";
import { ingestFromHttp, type LocalIngestExtras } from "../ingest";
import { refreshFromArenaApi } from "./harvest/arena/api";
import { refreshFromPinterestRelay } from "./harvest/pinterest/api";
import { refreshFromOgTags } from "./og";
import { harvestUrl, isSourceConnected } from "./scrape-window";
import { classifyUrl, supportsYtDlp } from "./sources";
import { downloadVideo } from "./yt-dlp";

export type RefreshOutcome =
  | {
      ok: true;
      method: "og" | "hidden-window" | "arena-api";
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
      source?: Source;
    };

export async function refreshSave(saveId: string): Promise<RefreshOutcome> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, saveId));
  const current = rows[0];
  if (!current) return { ok: false, reason: "not_found" };
  if (!current.url) return { ok: false, reason: "no_url" };

  if (typeof current.nsfwScore === "number") {
    const clearTx: Transaction = {
      kind: "update",
      model: "save",
      id: current.id,
      patch: { nsfwScore: null, nsfwLabel: null },
      before: {
        nsfwScore: current.nsfwScore,
        nsfwLabel: current.nsfwLabel,
      },
      meta: { actor: "user", actorReason: "refresh-rescan" },
    };
    try {
      await executeTransaction(clearTx);
    } catch (err) {
      log.warn("[pond refresh] failed to clear nsfwScore", saveId, err);
    }
  }

  const { source: classified, authWalled } = classifyUrl(current.url);
  const source: Source = current.source;
  const sourceId = current.sourceId;

  if (source === "arena" && sourceId) {
    const arenaResult = await refreshFromArenaApi({ sourceId });
    if (arenaResult.ok) {
      try {
        const result = await ingestFromHttp(arenaResult.payload, {
          trustAuthoritative: true,
          coverDims:
            arenaResult.width != null && arenaResult.height != null
              ? { width: arenaResult.width, height: arenaResult.height }
              : undefined,
        });
        return { ok: true, method: "arena-api", created: result.created };
      } catch (err) {
        log.warn("[pond refresh] arena-api ingest threw", err);
      }
    } else {
      log.info(
        "[pond refresh] arena-api fallback to legacy",
        sourceId,
        arenaResult.reason,
      );
    }
  }

  if (source === "pinterest" && sourceId) {
    const pinResult = await refreshFromPinterestRelay({ sourceId });
    if (pinResult.ok && pinResult.payload) {
      try {
        const result = await ingestFromHttp(pinResult.payload, {
          trustAuthoritative: true,
        });
        return { ok: true, method: "og", created: result.created };
      } catch (err) {
        log.warn("[pond refresh] pinterest-relay ingest threw", err);
      }
    } else {
      log.info(
        "[pond refresh] pinterest-relay fallback to og",
        sourceId,
        pinResult.reason,
      );
    }
  }

  if (!authWalled) {
    const og = await refreshFromOgTags({
      url: current.url,
      source,
      sourceId,
    });
    if (og.ok && og.payload) {
      const ytdlpExtras = await maybeDownloadVideo({
        url: current.url,
        classified,
        mediaType: og.payload.mediaType ?? null,
        hasMediaUrls:
          (og.payload.mediaUrls?.length ?? 0) > 0 ||
          Boolean(og.payload.mediaUrl),
      });
      try {
        const ogPayload = ytdlpExtras?.infoJson
          ? mergeInfoJsonIntoPayload(og.payload, source, ytdlpExtras.infoJson)
          : og.payload;
        const result = await ingestFromHttp(ogPayload, {
          mediaFiles: ytdlpExtras?.mediaFiles,
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

  const harvest = await harvestUrl({
    url: current.url,
    source: classified,
    sourceId,
  });

  if (!harvest.ok) {
    if (harvest.reason === "auth_required" && classified) {
      const connected = await isSourceConnected(classified).catch(() => false);
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

  const ytdlpExtras = await maybeDownloadVideo({
    url: current.url,
    classified,
    mediaType: payload.mediaType ?? null,
    hasMediaUrls: (payload.mediaUrls?.length ?? 0) > 0,
  });

  try {
    const finalPayload = ytdlpExtras?.infoJson
      ? mergeInfoJsonIntoPayload(payload, source, ytdlpExtras.infoJson)
      : payload;
    const result = await ingestFromHttp(finalPayload, {
      mediaFiles: ytdlpExtras?.mediaFiles,
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

function mergeInfoJsonIntoPayload(
  payload: IngestPayload,
  source: Source,
  infoJson: Record<string, unknown>,
): IngestPayload {
  const rawIn =
    payload.raw && typeof payload.raw === "object" && payload.raw !== null
      ? (payload.raw as Record<string, unknown>)
      : {};
  const perSourceIn =
    rawIn[source] && typeof rawIn[source] === "object" && rawIn[source] !== null
      ? (rawIn[source] as Record<string, unknown>)
      : {};
  return {
    ...payload,
    raw: {
      ...rawIn,
      [source]: { ...perSourceIn, ytdlp: infoJson },
    },
  };
}

async function maybeDownloadVideo(args: {
  url: string;
  classified: Source | null;
  mediaType: string | null;
  hasMediaUrls: boolean;
}): Promise<
  | (Required<Pick<LocalIngestExtras, "mediaFiles">> & {
      cleanup: () => Promise<void>;
      infoJson: Record<string, unknown> | null;
    })
  | null
> {
  if (!supportsYtDlp(args.classified)) return null;
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
    infoJson: result.infoJson,
  };
}

export {
  disconnectSource,
  isSourceConnected,
  signInToSource,
} from "./scrape-window";
