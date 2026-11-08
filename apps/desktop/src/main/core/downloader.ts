import type {
  DownloadProbeResult,
  DownloadRequest,
  DownloadStartResult,
} from "@shared/downloader-contracts";
import log from "electron-log/main.js";
import { enqueue } from "./pipeline/enqueue";
import { normalizeUrl } from "./pipeline/enqueue-input";
import { openEnqueuePersistence } from "./pipeline/enqueue-persistence";
import { classifyUrlToSource } from "./pipeline/extractors";
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

export async function probeDownload(url: string): Promise<DownloadProbeResult> {
  const result = await probeLink(url);
  if (!result.ok || result.probe.kind !== "single") return result;
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
