import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { TxSaveFile } from "@pond/schema/tx";
import log from "electron-log/main.js";

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
    bytes: buf,
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
    bytes: buf,
    mimeType: mime ?? undefined,
  };
}

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

export function pondUri(itemId: string, filename: string): string {
  return `pond://${itemId}/${filename}`;
}

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
    bytes: buf,
    mimeType: mime,
  };
}

export async function readLocalPosterToTxFile(
  path: string,
  options: { mimeType?: string; index?: number } = {},
): Promise<TxSaveFile | null> {
  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch (err) {
    log.warn("[pond blob] readLocalPoster failed", path, err);
    return null;
  }
  if (buf.byteLength === 0) {
    log.warn("[pond blob] readLocalPoster empty file", path);
    return null;
  }
  if (buf.byteLength > MAX_DOWNLOAD_BYTES) {
    log.warn(
      "[pond blob] readLocalPoster too big, skipping",
      buf.byteLength,
      path,
    );
    return null;
  }

  const ext = extname(path).toLowerCase() || ".jpg";
  const mime = options.mimeType ?? mimeFromExt(ext);
  const index = options.index ?? 0;
  const filename = index === 0 ? `poster${ext}` : `poster-${index}${ext}`;

  return {
    filename,
    bytes: buf,
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
