import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { RawYtdlp } from "@pond/schema/raw";
import { RawYtdlpSchema } from "@pond/schema/raw-schema";

export interface SubtitleFile {
  path: string;
  filename: string;
  mimeType: string;
}

async function readInfoJson(
  dir: string,
  videoPath: string,
): Promise<RawYtdlp | null> {
  const stem = basename(videoPath, extname(videoPath));
  const sidecar = join(dir, `${stem}.info.json`);
  let text: string;
  try {
    text = await readFile(sidecar, "utf8");
  } catch {
    return null;
  }
  const parsed = RawYtdlpSchema.safeParse(JSON.parse(text));
  if (!parsed.success) return null;
  const kept = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  );
  return Object.keys(kept).length > 0 ? kept : null;
}

export interface ProducedFile {
  path: string;
  size: number;
  mimeType: string;
  infoJson: RawYtdlp | null;
}

export async function readCompletedFiles(
  manifest: string,
): Promise<Set<string>> {
  let text: string;
  try {
    text = await readFile(manifest, "utf8");
  } catch {
    return new Set();
  }
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => resolve(line)),
  );
}

/** yt-dlp exits 1 when any entry fails, including link cards an X post lists after its own videos. */
export function keepsPartialDownload(
  code: number,
  completed: number,
  expected: number,
): boolean {
  return code === 1 && completed >= Math.max(1, expected);
}

/** Playlist order from info.json; size must not win, or a quoted 4K clip outranks the parent. */
export async function pickProducedFiles(
  dir: string,
  only?: ReadonlySet<string>,
): Promise<ProducedFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  if (entries.length === 0) return [];

  const sized = await Promise.all(
    entries
      .filter((name) => !/\.info\.json$/i.test(name))
      .filter((name) => !isThumbnail(name))
      .filter((name) => !isSubtitle(name))
      .filter((name) => !only || only.has(resolve(dir, name)))
      .map(async (name) => {
        const full = join(dir, name);
        try {
          const s = await stat(full);
          if (s.size <= 0) return null;
          const infoJson = await readInfoJson(dir, full);
          return {
            path: full,
            size: s.size,
            mimeType: mimeFor(full),
            infoJson,
          };
        } catch {
          return null;
        }
      }),
  );
  const valid = sized.filter((e): e is ProducedFile => e !== null);
  valid.sort((a, b) => playlistIndex(a) - playlistIndex(b));
  return valid;
}

function playlistIndex(file: ProducedFile): number {
  return file.infoJson?.playlist_index ?? 1;
}

function isThumbnail(name: string): boolean {
  const ext = extname(name).toLowerCase();
  return (
    ext === ".jpg" ||
    ext === ".jpeg" ||
    ext === ".png" ||
    ext === ".webp" ||
    ext === ".avif"
  );
}

function isSubtitle(name: string): boolean {
  const ext = extname(name).toLowerCase();
  return ext === ".srt" || ext === ".vtt";
}

export async function pickSubtitleFiles(dir: string): Promise<SubtitleFile[]> {
  const entries = await readdir(dir);
  const out: SubtitleFile[] = [];
  for (const name of entries) {
    if (!isSubtitle(name)) continue;
    const full = join(dir, name);
    try {
      const s = await stat(full);
      if (s.size === 0) continue;
    } catch {
      continue;
    }
    const ext = extname(name).toLowerCase();
    const stem = basename(name, ext);
    const dot = stem.lastIndexOf(".");
    const lang = dot >= 0 ? stem.slice(dot + 1) : "";
    out.push({
      path: full,
      filename: lang ? `subtitle.${lang}${ext}` : `subtitle${ext}`,
      mimeType: ext === ".vtt" ? "text/vtt" : "application/x-subrip",
    });
  }
  return out;
}

export async function pickProducedPoster(
  dir: string,
  videoPath: string,
): Promise<{ path: string; mimeType: string } | null> {
  const stem = basename(videoPath, extname(videoPath));
  const entries = await readdir(dir);
  for (const name of entries) {
    if (!name.startsWith(stem)) continue;
    if (!isThumbnail(name)) continue;
    const full = join(dir, name);
    try {
      const s = await stat(full);
      if (s.size === 0) continue;
    } catch {
      continue;
    }
    return { path: full, mimeType: imageMimeFor(name) };
  }
  return null;
}

/** Info JSON and thumbnail for a run that wrote no media, keyed off the first info.json stem. */
export async function readSidecars(dir: string): Promise<{
  infoJson: RawYtdlp | null;
  poster: { path: string; mimeType: string } | null;
}> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { infoJson: null, poster: null };
  }
  const info = entries.find((name) => /\.info\.json$/i.test(name));
  if (!info) return { infoJson: null, poster: null };
  const anchor = join(dir, `${info.replace(/\.info\.json$/i, "")}.media`);
  const [infoJson, poster] = await Promise.all([
    readInfoJson(dir, anchor).catch(() => null),
    pickProducedPoster(dir, anchor),
  ]);
  return { infoJson, poster };
}

function imageMimeFor(name: string): string {
  const ext = extname(name).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    default:
      return "image/jpeg";
  }
}

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
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
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".opus":
      return "audio/opus";
    case ".ogg":
      return "audio/ogg";
    default:
      return "video/mp4";
  }
}
