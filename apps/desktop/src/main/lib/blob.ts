import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { TxSaveFile } from "@pond/schema/tx";
import log from "electron-log/main.js";

/**
 * Ports `apps/web/src/lib/blob.ts`. Vercel Blob is replaced by local
 * filestore: we download the media URL, then return a `TxSaveFile`
 * descriptor. The executor's `writeItemFiles` is the thing that actually
 * writes bytes to disk, and `blob_url` on `saves` becomes a `pond://<id>/
 * <file>` URI.
 */

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50 MiB
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MiB -- avatars are tiny
const DOWNLOAD_TIMEOUT_MS = 30_000;

function extensionFor(mimeType: string | null, url: string): string {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if (fromUrl) return fromUrl;
  if (!mimeType) return ".bin";
  if (mimeType.includes("jpeg")) return ".jpg";
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("gif")) return ".gif";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("avif")) return ".avif";
  if (mimeType.includes("mp4")) return ".mp4";
  if (mimeType.includes("webm")) return ".webm";
  if (mimeType.includes("quicktime")) return ".mov";
  if (mimeType.includes("svg")) return ".svg";
  return ".bin";
}

function kindFor(mimeType: string | null): "cover" | "video" | "other" {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "cover";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

/**
 * Pull the mediaUrl into memory, return a TxSaveFile with the bytes
 * base64-encoded so the transaction payload stays JSON-serialisable.
 * Returns `null` if the URL is unreachable or suspicious (oversize, bad
 * content-type).
 *
 * `index` names the file -- 0 is always `cover.<ext>`, subsequent hits are
 * `media-1.<ext>`, `media-2.<ext>`... Videos write as `video<ext>` (or
 * `video-N<ext>`) so the custom protocol handler can MIME-sniff cheaply.
 */
export async function fetchMediaToTxFile(
  mediaUrl: string,
  index = 0,
): Promise<TxSaveFile | null> {
  let res: Response;
  try {
    res = await fetch(mediaUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    log.warn("[pond blob] fetch failed", mediaUrl, err);
    return null;
  }
  if (!res.ok) {
    log.warn("[pond blob] non-2xx", res.status, mediaUrl);
    return null;
  }

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    log.warn("[pond blob] too big, skipping", contentLength, mediaUrl);
    return null;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_DOWNLOAD_BYTES) {
    log.warn(
      "[pond blob] declared size mismatch, skipping",
      buf.byteLength,
      mediaUrl,
    );
    return null;
  }

  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  const ext = extensionFor(mime, mediaUrl);
  const kind = kindFor(mime);
  const filename = nameFor(kind, ext, index);

  return {
    filename,
    base64: buf.toString("base64"),
    mimeType: mime ?? undefined,
  };
}

function nameFor(
  kind: "cover" | "video" | "other",
  ext: string,
  index: number,
): string {
  if (kind === "video") {
    return index === 0 ? `video${ext}` : `video-${index}${ext}`;
  }
  return index === 0 ? `cover${ext}` : `media-${index}${ext}`;
}

/**
 * Pull an author avatar URL into a `TxSaveFile` named `avatar.<ext>`. This
 * is the chrome that `tweet-card` draws next to a handle — we store it
 * locally so the renderer never has to hotlink pbs.twimg.com (which breaks
 * offline, and rot-breaks when the user updates their profile photo).
 *
 * Smaller byte ceiling than `fetchMediaToTxFile` because a 400x400 avatar
 * is on the order of 10-60 KB; anything larger is almost certainly the
 * wrong URL.
 */
export async function fetchAvatarToTxFile(
  avatarUrl: string,
): Promise<TxSaveFile | null> {
  let res: Response;
  try {
    res = await fetch(avatarUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    log.warn("[pond blob] avatar fetch failed", avatarUrl, err);
    return null;
  }
  if (!res.ok) {
    log.warn("[pond blob] avatar non-2xx", res.status, avatarUrl);
    return null;
  }

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_AVATAR_BYTES) {
    log.warn("[pond blob] avatar too big, skipping", contentLength, avatarUrl);
    return null;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_AVATAR_BYTES) {
    log.warn(
      "[pond blob] avatar declared size mismatch, skipping",
      buf.byteLength,
      avatarUrl,
    );
    return null;
  }

  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  if (mime && !mime.startsWith("image/")) {
    log.warn("[pond blob] avatar not an image, skipping", mime, avatarUrl);
    return null;
  }

  const ext = extensionFor(mime, avatarUrl);
  return {
    filename: `avatar${ext}`,
    base64: buf.toString("base64"),
    mimeType: mime ?? undefined,
  };
}

/**
 * Batch variant. Downloads every URL in parallel, preserves input order
 * (important -- index 0 becomes the displayed cover), skips dupes by URL,
 * and silently drops any that fail. Returns only the successful subset.
 *
 * Two-pass naming: we first attempt every URL with its *requested* index
 * so URL #0 is always named `cover.<ext>` *if it succeeds*. Then we
 * re-name surviving entries by their position in the result array so
 * the cover slot is never empty when at least one download worked
 * (prevents `cover.jpg 404` in the renderer when only the first URL
 * was the broken one — common with X CDN hiccups).
 */
export async function fetchMediaBatch(urls: string[]): Promise<TxSaveFile[]> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    unique.push(u);
  }
  if (unique.length === 0) return [];

  const results = await Promise.all(
    unique.map((u, i) =>
      fetchMediaToTxFile(u, i).catch((err) => {
        log.warn("[pond blob] batch fetch failed", u, err);
        return null;
      }),
    ),
  );

  const survivors = results.filter((r): r is TxSaveFile => r !== null);
  return renumberCovers(survivors);
}

/**
 * Re-derive `cover.<ext>` / `media-N.<ext>` filenames so the cover slot
 * always lives at position 0 of the result array. Without this, a batch
 * where URL[0] failed but URL[1..N] succeeded would end up with
 * `media-1.jpg` as its first surviving entry — and the renderer (which
 * builds `pond://<id>/cover.jpg` from the cover-kind file) would 404.
 *
 * Videos keep their `video<-N>.<ext>` shape because the executor and
 * card-thumb both inspect on `kind === 'video'`, not on filename.
 */
function renumberCovers(files: TxSaveFile[]): TxSaveFile[] {
  let coverAssigned = false;
  let mediaIndex = 1;
  return files.map((f) => {
    const ext = extname(f.filename).toLowerCase() || ".bin";
    if (f.filename.startsWith("video")) return f;
    if (!coverAssigned) {
      coverAssigned = true;
      return { ...f, filename: `cover${ext}` };
    }
    return { ...f, filename: `media-${mediaIndex++}${ext}` };
  });
}

/**
 * Build a `pond://<itemId>/<filename>` URI. Used anywhere the old code
 * expected a Vercel Blob URL.
 */
export function pondUri(itemId: string, filename: string): string {
  return `pond://${itemId}/${filename}`;
}

/**
 * Slurp a local file (typically a yt-dlp output sitting in a tmpdir)
 * into a `TxSaveFile`. Mirrors `fetchMediaToTxFile` but skips the
 * network fetch — used by the refresh path when yt-dlp lands a video
 * on disk that we then need to materialise inside `<id>.info/`.
 *
 * The filename is *always* `video.<ext>` (or `video-N.<ext>` for
 * subsequent entries) so `inferKindFromFilename` tags it as
 * `kind: "video"`. Callers that want a different naming scheme
 * should rename the result before handing it to the executor.
 */
export async function readLocalToTxFile(
  path: string,
  options: { mimeType?: string; index?: number } = {},
): Promise<TxSaveFile | null> {
  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch (err) {
    log.warn("[pond blob] readLocal failed", path, err);
    return null;
  }

  if (buf.byteLength === 0) {
    log.warn("[pond blob] readLocal empty file", path);
    return null;
  }
  if (buf.byteLength > MAX_DOWNLOAD_BYTES) {
    log.warn("[pond blob] readLocal too big, skipping", buf.byteLength, path);
    return null;
  }

  const ext = extname(path).toLowerCase() || ".bin";
  const mime = options.mimeType ?? mimeFromExt(ext);
  // Force kind=video for the helper's primary use case (yt-dlp output)
  // so the executor + renderer treat the result as the playable file.
  // If a non-video extension sneaks in, fall back to the cover slot so
  // the renderer doesn't try to play a still image as a video.
  const kind: "cover" | "video" = mime.startsWith("video/") ? "video" : "cover";
  const index = options.index ?? 0;
  const filename =
    kind === "video"
      ? index === 0
        ? `video${ext}`
        : `video-${index}${ext}`
      : index === 0
        ? `cover${ext}`
        : `media-${index}${ext}`;

  return {
    filename,
    base64: buf.toString("base64"),
    mimeType: mime,
  };
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".mkv":
      return "video/x-matroska";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}
