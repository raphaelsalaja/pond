import { extname } from "node:path";
import type { TxSaveFile } from "@pond/schema/tx";
import {
  assignHarvestedFilenames,
  harvestedFilename,
} from "@shared/save-file-names";
import log from "electron-log/main.js";
import pLimit from "p-limit";
import sharp from "sharp";
import {
  DownloadSizeError,
  fetchDownload,
  type MediaFetcher,
  type TransferOptions,
} from "./download-transfer";

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

interface FetchMediaOptions extends TransferOptions {
  fileCount?: number;
  imageMaxBytes?: number | null;
  /** Fetches through the harvest session, whose cookies hold a bot challenge the harvest window already solved. */
  challengeFetcher?: MediaFetcher;
}

type BlobMiss = "transient" | "permanent" | "challenged";

function classifyHttpStatus(status: number): BlobMiss {
  if (status === 408 || status === 425 || status === 429) return "transient";
  if (status >= 500) return "transient";
  return "permanent";
}

/** Vercel and Cloudflare mark challenge pages with these headers; a bare request gets the same challenge on every retry. */
function isBotChallenge(response: Response): boolean {
  return (
    response.headers.get("x-vercel-mitigated") === "challenge" ||
    response.headers.get("cf-mitigated") === "challenge"
  );
}

function classifyMiss(response: Response): BlobMiss {
  return isBotChallenge(response)
    ? "challenged"
    : classifyHttpStatus(response.status);
}

type MediaFetchOutcome = { file: TxSaveFile } | { miss: BlobMiss };

interface MediaBatchEntry {
  url: string;
  file: TxSaveFile | null;
  miss?: BlobMiss;
}

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
  if (mimeType.includes("icon")) return ".ico";
  return ".bin";
}

function kindFor(mimeType: string | null): "image" | "video" | "other" {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

async function downloadMedia(
  mediaUrl: string,
  index: number,
  options: Omit<FetchMediaOptions, "challengeFetcher"> & {
    fetcher?: MediaFetcher;
  },
): Promise<Awaited<ReturnType<typeof fetchDownload>> | { miss: BlobMiss }> {
  try {
    return await fetchDownload({
      url: mediaUrl,
      fileIndex: index + 1,
      fileCount: options.fileCount ?? 1,
      maxBytes: MAX_DOWNLOAD_BYTES,
      ...options,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    log.warn("[pond blob] fetch failed", mediaUrl, error);
    return {
      miss: error instanceof DownloadSizeError ? "permanent" : "transient",
    };
  }
}

async function fetchMediaToTxFile(
  mediaUrl: string,
  index = 0,
  options: FetchMediaOptions = {},
): Promise<MediaFetchOutcome> {
  const { challengeFetcher, ...transfer } = options;
  let result = await downloadMedia(mediaUrl, index, transfer);
  if ("miss" in result) return result;
  if (!result.bytes && challengeFetcher && isBotChallenge(result.response)) {
    log.info("[pond blob] bot challenge, retrying in the harvest session", {
      url: mediaUrl,
      status: result.response.status,
    });
    result = await downloadMedia(mediaUrl, index, {
      ...transfer,
      fetcher: challengeFetcher,
    });
    if ("miss" in result) return result;
  }
  const { response: res, bytes: buf } = result;
  if (!buf) return { miss: classifyMiss(res) };
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? null;

  const ext = extensionFor(mime, mediaUrl);
  const kind = kindFor(mime);
  const filename = nameFor(kind, ext, index);

  return {
    file: {
      filename,
      bytes: buf,
      mimeType: mime ?? undefined,
    },
  };
}

function nameFor(
  kind: "image" | "video" | "other",
  ext: string,
  index: number,
): string {
  if (kind === "video") return harvestedFilename("video", index, ext);
  return harvestedFilename("image", index, ext);
}

const ICO_HEADER = Buffer.from([0x00, 0x00, 0x01, 0x00]);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const ICO_ENTRY_BYTES = 16;

/** Sites serve broken bytes under an image content type, so decode the pixels instead of trusting the header. */
export async function isReadableImage(buf: Buffer): Promise<boolean> {
  if (buf.subarray(0, 4).equals(ICO_HEADER)) return isReadableIco(buf);
  try {
    await sharp(buf).stats();
    return true;
  } catch {
    return false;
  }
}

/** sharp has no ICO decoder, so only entry bounds and embedded PNG entries can be checked. */
async function isReadableIco(buf: Buffer): Promise<boolean> {
  if (buf.byteLength < 6) return false;
  const count = buf.readUInt16LE(4);
  if (count === 0 || buf.byteLength < 6 + count * ICO_ENTRY_BYTES) {
    return false;
  }
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * ICO_ENTRY_BYTES;
    const size = buf.readUInt32LE(entry + 8);
    const offset = buf.readUInt32LE(entry + 12);
    if (size === 0 || offset + size > buf.byteLength) return false;
    const payload = buf.subarray(offset, offset + size);
    if (
      payload.subarray(0, 8).equals(PNG_SIGNATURE) &&
      !(await isReadableImage(payload))
    ) {
      return false;
    }
  }
  return true;
}

async function fetchSmallImageToTxFile(
  imageUrl: string,
  baseName: string,
): Promise<MediaFetchOutcome> {
  let res: Response;
  try {
    res = await fetch(imageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    log.warn(`[pond blob] ${baseName} fetch failed`, imageUrl, err);
    return { miss: "transient" };
  }
  if (!res.ok) {
    log.warn(`[pond blob] ${baseName} non-2xx`, res.status, imageUrl);
    return { miss: classifyHttpStatus(res.status) };
  }

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_AVATAR_BYTES) {
    log.warn(
      `[pond blob] ${baseName} too big, skipping`,
      contentLength,
      imageUrl,
    );
    return { miss: "permanent" };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    log.warn(`[pond blob] ${baseName} body read failed`, imageUrl, err);
    return { miss: "transient" };
  }
  if (buf.byteLength > MAX_AVATAR_BYTES) {
    log.warn(
      `[pond blob] ${baseName} declared size mismatch, skipping`,
      buf.byteLength,
      imageUrl,
    );
    return { miss: "permanent" };
  }

  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  if (mime && !mime.startsWith("image/")) {
    log.warn(`[pond blob] ${baseName} not an image, skipping`, mime, imageUrl);
    return { miss: "permanent" };
  }

  if (!(await isReadableImage(buf))) {
    log.warn(`[pond blob] ${baseName} not a readable image`, imageUrl);
    return { miss: "permanent" };
  }

  const ext = extensionFor(mime, imageUrl);
  return {
    file: {
      filename: `${baseName}${ext}`,
      bytes: buf,
      mimeType: mime ?? undefined,
    },
  };
}

export function fetchAvatarToTxFile(
  avatarUrl: string,
): Promise<MediaFetchOutcome> {
  return fetchSmallImageToTxFile(avatarUrl, "avatar");
}

export function fetchSourceIconToTxFile(
  iconUrl: string,
): Promise<MediaFetchOutcome> {
  return fetchSmallImageToTxFile(iconUrl, "source-icon");
}

export async function fetchMediaBatch(
  urls: string[],
  options: FetchMediaOptions = {},
): Promise<MediaBatchEntry[]> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    unique.push(u);
  }
  if (unique.length === 0) return [];

  const limit = pLimit(6);
  const results: MediaBatchEntry[] = await Promise.all(
    unique.map((u, i) =>
      limit(async (): Promise<MediaBatchEntry> => {
        try {
          const outcome = await fetchMediaToTxFile(u, i, {
            ...options,
            fileCount: unique.length,
          });
          return "file" in outcome
            ? { url: u, file: outcome.file }
            : { url: u, file: null, miss: outcome.miss };
        } catch (err) {
          if (options.signal?.aborted) throw err;
          log.warn("[pond blob] batch fetch failed", u, err);
          return { url: u, file: null, miss: "transient" };
        }
      }),
    ),
  );

  const named = assignHarvestedFilenames(results.map((entry) => entry.file));
  return results.map((entry, index) => {
    const file = named[index] ?? null;
    return file ? { ...entry, file } : entry;
  });
}
