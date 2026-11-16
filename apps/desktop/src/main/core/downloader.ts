import type {
  DownloadFileProbe,
  DownloadPostProbe,
  DownloadProbeFailure,
  DownloadProbeResult,
  DownloadRequest,
  DownloadStartResult,
} from "@shared/downloader-contracts";
import log from "electron-log/main.js";
import { probeFile } from "./download-file";
import { postProbeOf } from "./download-post";
import { enqueue } from "./pipeline/enqueue";
import { normalizeUrl } from "./pipeline/enqueue-input";
import { openEnqueuePersistence } from "./pipeline/enqueue-persistence";
import { classifyUrlToSource, resolveExtractor } from "./pipeline/extractors";
import { sourceIdFromUrl } from "./pipeline/url";
import { queueVideoDownloads } from "./refresh/video-downloads";
import { probeFrames, probeLink } from "./refresh/yt-dlp-probe";

async function findExistingSave(url: string): Promise<string | null> {
  try {
    const normalized = normalizeUrl(url);
    const { source } = classifyUrlToSource(normalized);
    if (!source) return null;
    const sourceId = sourceIdFromUrl(source, normalized);
    if (!sourceId) return null;
    const persistence = await openEnqueuePersistence();
    const save = await persistence.loadExistingSave(source, sourceId);
    return save && !save.deletedAt ? save.id : null;
  } catch {
    return null;
  }
}

/** yt-dlp failures where the link may still be a post, page or file Pond can save. */
const POST_FALLBACK: ReadonlySet<DownloadProbeFailure> = new Set([
  "unsupported",
  "unavailable",
  "failed",
]);
const POST_TIMEOUT_MS = 45_000;
const FILE_TIMEOUT_MS = 15_000;

async function probePost(url: string): Promise<DownloadPostProbe | null> {
  try {
    const normalized = normalizeUrl(url);
    const capture = await resolveExtractor(normalized).extract({
      url: new URL(normalized),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    return postProbeOf(capture, normalized, await findExistingSave(normalized));
  } catch (error) {
    log.info("[pond downloader] no post capture", url, error);
    return null;
  }
}

async function probeLinkedFile(url: string): Promise<DownloadFileProbe | null> {
  try {
    return await probeFile(
      normalizeUrl(url),
      AbortSignal.timeout(FILE_TIMEOUT_MS),
    );
  } catch (error) {
    log.info("[pond downloader] no file", url, error);
    return null;
  }
}

export async function probeDownload(url: string): Promise<DownloadProbeResult> {
  const result = await probeLink(url);
  if (!result.ok) {
    if (!POST_FALLBACK.has(result.reason)) return result;
    const found = (await probePost(url)) ?? (await probeLinkedFile(url));
    return found ? { ok: true, probe: found } : result;
  }
  if (result.probe.kind !== "single") return result;
  /** yt-dlp's generic extractor accepts any direct link, so a PDF reads as media with nothing to play. */
  if (
    result.probe.videoOptions.length === 0 &&
    result.probe.duration === null
  ) {
    const file = await probeLinkedFile(url);
    if (file && !/^(audio|video)\//.test(file.mimeType ?? ""))
      return { ok: true, probe: file };
  }
  const existingSaveId = await findExistingSave(result.probe.url);
  return { ok: true, probe: { ...result.probe, existingSaveId } };
}

export function sampleDownloadFrames(
  url: string,
  count: number,
): Promise<string[]> {
  return probeFrames(url, count);
}

export async function startDownloads(
  urls: readonly string[],
  request: DownloadRequest,
): Promise<DownloadStartResult> {
  const ids: string[] = [];
  const failed: string[] = [];
  const single = urls.length === 1;
  for (const url of urls) {
    try {
      const { id } = await enqueue(url, { trigger: "user:download" });
      const queued = await queueVideoDownloads([id], {
        interactive: true,
        download: single ? request : { ...request, range: null },
      });
      if (queued > 0) ids.push(id);
      else failed.push(url);
    } catch (error) {
      log.warn("[pond downloader] could not start", url, error);
      failed.push(url);
    }
  }
  return { ids, failed };
}
