import type { DownloadFileProbe } from "@shared/downloader-contracts";
import { browserUserAgent } from "./refresh/harvest-window/constants";

/** Files are held in memory on their way to a save or folder. */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;

const EXTENSIONS = new Map(
  Object.entries({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "image/heic": "heic",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/json": "json",
    "text/plain": "txt",
    "text/csv": "csv",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  }),
);

export class FileTooLargeError extends Error {}

function mimeOf(headers: Headers): string | null {
  return (
    headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || null
  );
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function dispositionName(headers: Headers): string | null {
  const value = headers.get("content-disposition");
  if (!value) {
    return null;
  }
  const encoded = /filename\*\s*=\s*(?:[\w-]+'[\w-]*')?"?([^";]+)"?/i.exec(
    value,
  )?.[1];
  if (encoded) {
    return decoded(encoded.trim());
  }
  return /filename\s*=\s*"?([^";]+)"?/i.exec(value)?.[1]?.trim() || null;
}

export function fileNameOf(url: string, headers: Headers): string {
  const parsed = new URL(url);
  const segment = decoded(
    parsed.pathname.split("/").filter(Boolean).at(-1) ?? "",
  );
  const name = dispositionName(headers) || segment || parsed.hostname;
  if (/\.[a-z0-9]{1,8}$/i.test(name)) {
    return name;
  }
  const mime = mimeOf(headers);
  /** Image CDNs like Twitter's put the format in the query instead of the path. */
  const format = parsed.searchParams.get("format");
  const extension =
    (mime ? EXTENSIONS.get(mime) : undefined) ??
    (format && /^[a-z0-9]{2,5}$/i.test(format) ? format : null);
  return extension ? `${name}.${extension}` : name;
}

/** HTML is a page for the post path, never a file. */
function isPage(mime: string | null): boolean {
  return mime === "text/html" || mime === "application/xhtml+xml";
}

export function fileProbeOf(
  url: string,
  headers: Headers,
): DownloadFileProbe | null {
  const mimeType = mimeOf(headers);
  if (isPage(mimeType)) {
    return null;
  }
  const length = Number(headers.get("content-length"));
  return {
    kind: "file",
    url,
    site: new URL(url).hostname.replace(/^www\./, ""),
    name: fileNameOf(url, headers),
    mimeType,
    size: Number.isFinite(length) && length > 0 ? length : null,
    existingSaveId: null,
  };
}

function request(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    redirect: "follow",
    signal,
    headers: { "user-agent": browserUserAgent() },
  });
}

/** Reads only the headers; some servers refuse HEAD, so this is a GET with the body dropped. */
export async function probeFile(
  url: string,
  signal: AbortSignal,
): Promise<DownloadFileProbe | null> {
  const response = await request(url, signal);
  await response.body?.cancel();
  if (!response.ok) {
    return null;
  }
  return fileProbeOf(response.url || url, response.headers);
}

export interface RemoteFile {
  bytes: Buffer;
  filename: string;
  mimeType: string;
}

export async function fetchFile(
  url: string,
  signal: AbortSignal,
): Promise<RemoteFile> {
  const response = await request(url, signal);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  if (Number(response.headers.get("content-length")) > MAX_FILE_BYTES) {
    await response.body?.cancel();
    throw new FileTooLargeError();
  }
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  for await (const chunk of response.body ?? []) {
    total += chunk.byteLength;
    if (total > MAX_FILE_BYTES) {
      throw new FileTooLargeError();
    }
    chunks.push(chunk);
  }
  return {
    bytes: Buffer.concat(chunks),
    filename: fileNameOf(response.url || url, response.headers),
    mimeType: mimeOf(response.headers) ?? "application/octet-stream",
  };
}
