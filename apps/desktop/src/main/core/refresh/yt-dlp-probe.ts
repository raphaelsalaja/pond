import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  DownloadProbeError,
  DownloadProbeResult,
} from "@shared/downloader-contracts";
import log from "electron-log/main.js";
import { classifyUrlToSource } from "../pipeline/extractors";
import { partitionForIngest } from "../sync/accounts";
import { binariesAvailable } from "./binaries";
import { writeNetscapeCookies } from "./cookies";
import { cookieAttempts } from "./yt-dlp-format";
import {
  frameSourceOf,
  toDownloadProbe,
  type YtdlpProbeInfo,
  YtdlpProbeInfoSchema,
} from "./yt-dlp-probe-parse";
import { runWithTimeout } from "./yt-dlp-process";
import { ensureYtDlp } from "./yt-dlp-updater";

const PROBE_TIMEOUT_MS = 45_000;
const FRAME_TIMEOUT_MS = 15_000;
const FRAME_CONCURRENCY = 4;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_LIMIT = 40;

interface CachedProbe {
  at: number;
  info: YtdlpProbeInfo;
  result: Extract<DownloadProbeResult, { ok: true }>;
}

const cache = new Map<string, CachedProbe>();

function normalizeProbeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function fresh(url: string): CachedProbe | null {
  const hit = cache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(url);
    return null;
  }
  return hit;
}

function remember(url: string, entry: CachedProbe): void {
  cache.delete(url);
  cache.set(url, entry);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function classifyProbeFailure(
  code: number,
  stderr: string,
): DownloadProbeError {
  if (code === 124) {
    return {
      reason: "timeout",
      message: "The site took too long to answer. Try again.",
    };
  }
  if (/unsupported url/i.test(stderr)) {
    return {
      reason: "unsupported",
      message: "Pond can't download from this site.",
    };
  }
  if (/drm/i.test(stderr)) {
    return {
      reason: "unsupported",
      message: "This site protects its media, so Pond can't download it.",
    };
  }
  if (
    /sign in|log ?in|logged[- ]in|confirm you.re not a bot|use --cookies|age[- ]restricted|members[- ]only/i.test(
      stderr,
    )
  ) {
    return {
      reason: "sign-in",
      message:
        "This site needs you to sign in. Connect it in Sources, then try again.",
    };
  }
  if (
    /private video|video unavailable|not available|has been removed|does not exist|http error 404|http error 410/i.test(
      stderr,
    )
  ) {
    return {
      reason: "unavailable",
      message: "This link isn't available. It may be private or removed.",
    };
  }
  return {
    reason: "failed",
    message: "Pond couldn't read this link. Check it and try again.",
  };
}

async function readProbeInfo(dir: string): Promise<YtdlpProbeInfo | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const name =
    names.find((entry) => entry === "playlist.info.json") ??
    names.find((entry) => entry.endsWith(".info.json"));
  if (!name) return null;
  try {
    const parsed = YtdlpProbeInfoSchema.safeParse(
      JSON.parse(await readFile(join(dir, name), "utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function probeLink(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<DownloadProbeResult> {
  const url = normalizeProbeUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      reason: "invalid",
      message: "Enter a link that starts with http or https.",
    };
  }
  const cached = fresh(url);
  if (cached) return cached.result;

  await ensureYtDlp();
  const { ytdlp } = binariesAvailable();
  if (!ytdlp) {
    return {
      ok: false,
      reason: "failed",
      message: "The downloader is still installing. Try again in a minute.",
    };
  }

  const { source } = classifyUrlToSource(url);
  const partition =
    source && source !== "web" ? await partitionForIngest(source) : undefined;
  const cookies = await writeNetscapeCookies(partition);
  let dir: string | null = null;
  try {
    let last = { code: -1, stderr: "" };
    for (const withCookies of cookieAttempts(source, cookies.count)) {
      if (dir) await rm(dir, { recursive: true, force: true });
      dir = await mkdtemp(join(tmpdir(), "pond-probe-"));
      const argv = [
        "--skip-download",
        "--write-info-json",
        "--flat-playlist",
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout",
        "20",
        ...(withCookies ? ["--cookies", cookies.path] : []),
        "-o",
        join(dir, "item.%(ext)s"),
        "-o",
        `pl_infojson:${join(dir, "playlist.%(ext)s")}`,
        url,
      ];
      const outcome = await runWithTimeout(
        ytdlp,
        argv,
        PROBE_TIMEOUT_MS,
        signal,
      );
      const info = await readProbeInfo(dir);
      if (info) {
        const result = {
          ok: true as const,
          probe: toDownloadProbe(info, url, source),
        };
        remember(url, { at: Date.now(), info, result });
        return result;
      }
      last = outcome;
      if (signal?.aborted) break;
    }
    log.info("[pond downloader] probe failed", url, last.stderr.slice(-400));
    const failure: DownloadProbeResult = {
      ok: false,
      ...classifyProbeFailure(last.code, last.stderr),
    };
    if (source && source !== "web") failure.source = source;
    return failure;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    await cookies.cleanup();
  }
}

function headerArg(headers: Record<string, string>): string[] {
  const lines = Object.entries(headers)
    .filter(([key, value]) => key && value && !/[\r\n]/.test(key + value))
    .map(([key, value]) => `${key}: ${value}\r\n`);
  return lines.length > 0 ? ["-headers", lines.join("")] : [];
}

/** Samples frames straight from the remote stream for sites that publish no storyboard. */
export async function probeFrames(
  rawUrl: string,
  count: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const url = normalizeProbeUrl(rawUrl);
  if (!url) return [];
  let cached = fresh(url);
  if (!cached) {
    await probeLink(url, signal);
    cached = fresh(url);
  }
  const target = cached ? frameSourceOf(cached.info) : null;
  const { ffmpeg } = binariesAvailable();
  if (!target || !ffmpeg) return [];

  const dir = await mkdtemp(join(tmpdir(), "pond-frames-"));
  try {
    const times = Array.from(
      { length: count },
      (_, index) => ((index + 0.5) / count) * target.duration,
    );
    const frames = Array.from({ length: count }, (): string | null => null);
    for (let offset = 0; offset < times.length; offset += FRAME_CONCURRENCY) {
      if (signal?.aborted) break;
      const batch = times.slice(offset, offset + FRAME_CONCURRENCY);
      await Promise.all(
        batch.map(async (time, batchIndex) => {
          const index = offset + batchIndex;
          const out = join(dir, `${index}.jpg`);
          const { code } = await runWithTimeout(
            ffmpeg,
            [
              "-v",
              "error",
              ...headerArg(target.headers),
              "-ss",
              time.toFixed(2),
              "-i",
              target.url,
              "-frames:v",
              "1",
              "-vf",
              "scale=-2:120",
              "-q:v",
              "5",
              "-y",
              out,
            ],
            FRAME_TIMEOUT_MS,
            signal,
          );
          if (code !== 0) return;
          try {
            const bytes = await readFile(out);
            frames[index] =
              `data:image/jpeg;base64,${bytes.toString("base64")}`;
          } catch {}
        }),
      );
    }
    const found = frames.filter((frame) => frame !== null).length;
    if (found < Math.ceil(count / 2)) return [];
    let previous = frames.find((frame) => frame !== null) ?? "";
    return frames.map((frame) => {
      previous = frame ?? previous;
      return previous;
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
