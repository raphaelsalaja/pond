import { extname } from "node:path";
import type { SaveFile } from "@pond/schema/db";
import log from "electron-log/main.js";
import { fetchMediaBatch } from "../../../lib/blob";
import { applySavePatch, readSave } from "./apply";

export async function runFetchBlobs(saveId: string): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;

  const urls = collectMediaUrls(save.rawJson);
  if (urls.length === 0) {
    log.debug("[pond pipeline:fetch-blobs] no media urls, skipping", saveId);
    return;
  }

  // Self-gate: every URL already mapped to a file => skip.
  const existingFiles = save.files ?? [];
  const haveAllCovers = mediaUrlsCovered(urls, existingFiles);
  if (haveAllCovers) {
    log.debug(
      "[pond pipeline:fetch-blobs] all media already on disk, skipping",
      saveId,
    );
    return;
  }

  const fetched = await fetchMediaBatch(urls);
  if (fetched.length === 0) {
    log.warn("[pond pipeline:fetch-blobs] all fetches failed", saveId, urls);
    return;
  }

  const newFiles = fetched.map((tx) => {
    const kind: SaveFile["kind"] = tx.filename.startsWith("video")
      ? "video"
      : tx.filename.startsWith("cover")
        ? "cover"
        : "media";
    return {
      kind,
      filename: tx.filename,
      bytes: Buffer.from(tx.bytes),
      ...(tx.mimeType ? { mimeType: tx.mimeType } : {}),
    };
  });

  await applySavePatch(
    saveId,
    { fileSize: newFiles[0]?.bytes.byteLength ?? null },
    {
      actorReason: "pipeline:fetch-blobs",
      newFiles,
    },
  );
  log.info("[pond pipeline:fetch-blobs] wrote", {
    saveId,
    count: newFiles.length,
  });
}

// Pull every URL we can fetch with a plain GET. For video items that means
// only direct media files (Instagram /Pinterest /Twitter CDNs that serve a
// signed .mp4). Page URLs like youtube.com/watch or tiktok.com/@x/video/123
// have no usable extension and stay reserved for fetch_video_ytdlp.
function collectMediaUrls(rawJson: unknown): string[] {
  if (!rawJson || typeof rawJson !== "object") return [];
  const v = rawJson as {
    capture?: { media?: Array<{ url?: string; type?: string }> };
  };
  const media = v.capture?.media ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of media) {
    if (typeof m.url !== "string") continue;
    if (m.type === "video" && !hasDirectVideoExtension(m.url)) continue;
    if (seen.has(m.url)) continue;
    seen.add(m.url);
    out.push(m.url);
  }
  return out;
}

const DIRECT_VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v"]);

function hasDirectVideoExtension(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const dot = path.lastIndexOf(".");
    if (dot === -1) return false;
    return DIRECT_VIDEO_EXTENSIONS.has(path.slice(dot));
  } catch {
    return false;
  }
}

function mediaUrlsCovered(
  urls: string[],
  files: ReadonlyArray<SaveFile>,
): boolean {
  if (urls.length === 0) return true;
  // We don't preserve the URL→file mapping. Use file count as a coarse signal:
  // if we have at least one cover + as many media-* as URLs, assume covered.
  const coverCount = files.filter(
    (f) => f.kind === "cover" || f.kind === "media",
  ).length;
  return coverCount >= urls.length;
}

void extname;
