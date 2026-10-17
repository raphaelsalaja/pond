import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import log from "electron-log/main.js";
import { resolvePondSavePath } from "../ipc/helpers";
import { killProcessTree, trackChildProcess } from "../lib/process-tree";
import { libraryRoot } from "../paths";
import { binariesAvailable } from "./refresh/binaries";

export const VIDEO_CACHE_HOST = "_video_cache";
export const VIDEO_CACHE_DIR = "_video_cache";
const PROXY_TIMEOUT_MS = 30 * 60_000;
const inFlight = new Map<string, Promise<string | null>>();

export function buildVideoPreviewArguments(
  source: string,
  output: string,
): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    source,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-map_metadata",
    "-1",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale=ceil(iw/2)*2:ceil(ih/2)*2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    output,
  ];
}

export async function ensureVideoPreviewProxy(
  src: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const resolved = resolvePondSavePath(src);
  if (!resolved) return { ok: false, error: "The video file is unavailable." };
  const ffmpeg = binariesAvailable().ffmpeg;
  if (!ffmpeg) {
    return {
      ok: false,
      error: "FFmpeg is unavailable, so Pond could not prepare this video.",
    };
  }

  const sourceInfo = await stat(resolved.path).catch(() => null);
  if (!sourceInfo?.isFile()) {
    return { ok: false, error: "The video file is unavailable." };
  }
  const key = createHash("sha256")
    .update(resolved.path)
    .update("\0")
    .update(String(sourceInfo.size))
    .update("\0")
    .update(String(sourceInfo.mtimeMs))
    .digest("hex");
  const filename = `${key}.mp4`;
  const cacheRoot = join(libraryRoot(), VIDEO_CACHE_DIR);
  const destination = join(cacheRoot, filename);

  const cached = await stat(destination).catch(() => null);
  if (cached?.isFile() && cached.size > 0) {
    return { ok: true, url: `pond://${VIDEO_CACHE_HOST}/${filename}` };
  }

  let pending = inFlight.get(key);
  if (!pending) {
    pending = createVideoPreviewProxy({
      cacheRoot,
      destination,
      ffmpeg,
      source: resolved.path,
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  try {
    await pending;
  } catch (error) {
    log.warn(
      "[pond video-preview] proxy generation failed",
      resolved.path,
      error,
    );
    return {
      ok: false,
      error: "Pond could not prepare a compatible video preview.",
    };
  }
  return { ok: true, url: `pond://${VIDEO_CACHE_HOST}/${filename}` };
}

async function createVideoPreviewProxy(input: {
  cacheRoot: string;
  destination: string;
  ffmpeg: string;
  source: string;
}): Promise<string> {
  await mkdir(input.cacheRoot, { recursive: true });
  const temporary = join(input.cacheRoot, `.video-preview-${randomUUID()}.mp4`);
  try {
    await runFfmpeg(
      input.ffmpeg,
      buildVideoPreviewArguments(input.source, temporary),
    );
    const output = await stat(temporary);
    if (output.size === 0) throw new Error("FFmpeg wrote an empty preview.");
    await rename(temporary, input.destination);
    return input.destination;
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

function runFfmpeg(path: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(path, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    trackChildProcess(child);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-2_000);
    });
    const timer = setTimeout(() => {
      killProcessTree(child, "SIGKILL");
    }, PROXY_TIMEOUT_MS);
    timer.unref();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
    });
  });
}
