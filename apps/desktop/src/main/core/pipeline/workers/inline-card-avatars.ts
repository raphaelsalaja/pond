import { existsSync } from "node:fs";
import { extname } from "node:path";
import type { Save, SaveFile } from "@pond/schema/db";
import type { Capture, CaptureMedia } from "@pond/schema/raw";
import type { TxSaveFile } from "@pond/schema/tx";
import sharp from "sharp";
import { fetchAvatarToTxFile } from "../../../lib/blob";
import { saveFile } from "../../../paths";
import { readLibraryMedia } from "../../storage/library-media-storage";

export interface InlinedAvatars {
  capture: Capture;
  avatarFile?: TxSaveFile;
  avatarSourceUrl?: string;
}

const CARD_IMAGE_LONG_EDGE = 1100;
const CARD_FETCH_MAX_BYTES = 8 * 1024 * 1024;
const CARD_FETCH_TIMEOUT_MS = 30_000;

export async function inlineCaptureAvatars(
  capture: Capture,
  save: Save,
): Promise<InlinedAvatars> {
  const next = structuredClone(capture);
  const sourceUrl = next.author?.avatarUrl;

  const [avatarFile] = await Promise.all([
    inlineAuthorAvatar(next, save),
    inlineQuotedAvatar(next),
    inlineCardMedia(next, save),
  ]);

  const inlined: InlinedAvatars = { capture: next };
  if (avatarFile) inlined.avatarFile = avatarFile;
  if (sourceUrl && avatarFile) inlined.avatarSourceUrl = sourceUrl;
  return inlined;
}

async function inlineAuthorAvatar(
  capture: Capture,
  save: Save,
): Promise<TxSaveFile | undefined> {
  const author = capture.author;
  if (!author?.avatarUrl) return undefined;
  const fromDisk = await readDiskAvatar(save);
  if (fromDisk) {
    author.avatarUrl = fromDisk;
    return undefined;
  }
  const fetched = await urlToDataUrl(author.avatarUrl);
  if (!fetched) return undefined;
  author.avatarUrl = fetched.dataUrl;
  return fetched.file;
}

async function inlineQuotedAvatar(capture: Capture): Promise<void> {
  const quoted = quotedAuthor(capture);
  if (!quoted?.avatarUrl || quoted.avatarUrl.startsWith("data:")) return;
  const fetched = await urlToDataUrl(quoted.avatarUrl);
  if (fetched) quoted.avatarUrl = fetched.dataUrl;
}

function quotedAuthor(capture: Capture): { avatarUrl?: string } | undefined {
  return capture.quoted?.author;
}

async function inlineCardMedia(capture: Capture, save: Save): Promise<void> {
  const urls = collectCardImageUrls(capture);
  if (urls.length === 0) return;

  const rewritten = new Map<string, string>();
  await Promise.all(
    urls.map(async (url) => {
      const dataUrl = await resolveCardImage(url, save);
      if (dataUrl) rewritten.set(url, dataUrl);
    }),
  );
  if (rewritten.size === 0) return;

  const swap = (url: string | undefined): string | undefined =>
    url ? (rewritten.get(url) ?? url) : undefined;

  if (capture.media) {
    capture.media = capture.media.map((m) => rewriteMedia(m, swap));
  }

  if (capture.quoted?.media) {
    capture.quoted.media = capture.quoted.media.map((m) =>
      rewriteMedia(m, swap),
    );
  }

  if (capture.card?.imageUrl) {
    const next = swap(capture.card.imageUrl);
    if (next) capture.card.imageUrl = next;
  }
}

function collectCardImageUrls(capture: Capture): string[] {
  const urls: string[] = [];
  const add = (url: string | undefined) => {
    if (url && isHttpUrl(url)) urls.push(url);
  };
  for (const m of capture.media ?? []) {
    if (m.type === "video") add(m.posterUrl);
    else if (m.type === "image") add(m.url);
  }
  for (const m of capture.quoted?.media ?? []) {
    if (m.type === "video") add(m.posterUrl);
    else if (m.type === "image") add(m.url);
  }
  add(capture.card?.imageUrl);
  return [...new Set(urls)];
}

function rewriteMedia(
  media: CaptureMedia,
  swap: (url: string | undefined) => string | undefined,
): CaptureMedia {
  if (media.type === "video") {
    const posterUrl = swap(media.posterUrl);
    return posterUrl ? { ...media, posterUrl } : media;
  }
  if (media.type === "image") {
    const url = swap(media.url);
    return url ? { ...media, url } : media;
  }
  return media;
}

async function resolveCardImage(
  url: string,
  save: Save,
): Promise<string | null> {
  const fromDisk = await readDiskBySourceUrl(save, url);
  if (fromDisk) return bytesToCardDataUrl(fromDisk.bytes, fromDisk.mime);

  for (const candidate of twimgCandidates(url)) {
    const fetched = await fetchCardImage(candidate);
    if (fetched) return bytesToCardDataUrl(fetched.bytes, fetched.mime);
  }
  return null;
}

function twimgCandidates(url: string): string[] {
  const out = [url];
  try {
    const u = new URL(url);
    if (u.hostname !== "pbs.twimg.com") return out;
    if (u.searchParams.get("name") !== "orig") return out;
    const large = new URL(url);
    large.searchParams.set("name", "large");
    out.push(large.toString());
    const plain = new URL(url);
    plain.searchParams.delete("name");
    out.push(plain.toString());
  } catch {
    return out;
  }
  return out;
}

async function fetchCardImage(
  url: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(CARD_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (mime && !mime.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > CARD_FETCH_MAX_BYTES) {
      return null;
    }
    return { bytes, mime: mime || "image/jpeg" };
  } catch {
    return null;
  }
}

async function bytesToCardDataUrl(
  bytes: Buffer,
  mime: string,
): Promise<string | null> {
  try {
    const pipeline = sharp(bytes, { failOn: "none" });
    const meta = await pipeline.metadata();
    if ((meta.pages ?? 1) > 1) {
      if (bytes.byteLength > CARD_FETCH_MAX_BYTES) return null;
      return `data:${mime || "image/gif"};base64,${bytes.toString("base64")}`;
    }
    const { data } = await pipeline
      .resize(CARD_IMAGE_LONG_EDGE, CARD_IMAGE_LONG_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return `data:image/jpeg;base64,${data.toString("base64")}`;
  } catch {
    if (bytes.byteLength > 500_000) return null;
    const fallback = mime.startsWith("image/") ? mime : "image/jpeg";
    return `data:${fallback};base64,${bytes.toString("base64")}`;
  }
}

async function readDiskBySourceUrl(
  save: Save,
  url: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const file = (save.files ?? []).find((f) => f.sourceUrl === url);
  if (!file) return null;
  return readSaveFileBytes(save, file);
}

async function readDiskAvatar(save: Save): Promise<string | null> {
  const file = (save.files ?? []).find((f) => f.kind === "avatar");
  if (!file) return null;
  const read = await readSaveFileBytes(save, file);
  if (!read) return null;
  return `data:${read.mime};base64,${read.bytes.toString("base64")}`;
}

async function readSaveFileBytes(
  save: Save,
  file: SaveFile,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const path = saveFile(save.id, file.path);
  if (!existsSync(path)) return null;
  try {
    const bytes = await readLibraryMedia(path);
    return {
      bytes,
      mime: file.mimeType || mimeFromExt(extname(file.path)),
    };
  } catch {
    return null;
  }
}

async function urlToDataUrl(
  url: string,
): Promise<{ dataUrl: string; file: TxSaveFile } | null> {
  if (url.startsWith("data:")) return null;
  const outcome = await fetchAvatarToTxFile(url);
  if (!("file" in outcome)) return null;
  const mime = outcome.file.mimeType ?? "image/jpeg";
  const bytes = Buffer.from(outcome.file.bytes);
  return {
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    file: outcome.file,
  };
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}
