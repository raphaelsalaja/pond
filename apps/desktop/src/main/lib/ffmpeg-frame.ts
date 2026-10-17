import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import log from "electron-log/main.js";
import { binariesAvailable } from "../core/refresh/binaries";
import { killProcessTree } from "./process-tree";

const HARD_TIMEOUT_MS = 10_000;
const SAMPLE_TIMEOUT_MS = 30_000;

export interface ExtractedFrame {
  path: string;
  mimeType: string;
  size: number;
  cleanup: () => Promise<void>;
}

export interface ExtractedFrames {
  frames: Array<Omit<ExtractedFrame, "cleanup">>;
  timestamps: number[];
  durationSec: number;
  cleanup: () => Promise<void>;
}

export function sampleFrameTimestamps(
  durationSec: number,
  maxFrames: number,
): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const cap = Math.min(12, Math.max(3, Math.floor(maxFrames)));
  const count = Math.min(cap, Math.max(3, Math.ceil(durationSec / 30) + 2));
  return Array.from({ length: count }, (_, index) =>
    Number((((index + 1) * durationSec) / (count + 1)).toFixed(3)),
  );
}

export function embeddingFrameTimestamps(
  durationSec: number,
  maxFrames = 32,
): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const cappedDuration = Math.min(durationSec, 32);
  const count = Math.min(
    Math.max(1, Math.floor(maxFrames)),
    Math.max(1, Math.ceil(cappedDuration)),
  );
  return Array.from({ length: count }, (_, index) => index);
}

export async function extractFirstFrame(
  videoPath: string,
): Promise<ExtractedFrame | null> {
  return extractJpeg(videoPath, (outPath) =>
    jpegArgv(videoPath, outPath, ["before", "0"]),
  );
}

export async function extractFrameAt(
  videoPath: string,
  timeSec: number,
): Promise<ExtractedFrame | null> {
  const seek = Math.max(0, Number.isFinite(timeSec) ? timeSec : 0);
  return extractJpeg(videoPath, (outPath) =>
    jpegArgv(videoPath, outPath, ["after", String(seek)]),
  );
}

export async function extractSampledFrames(
  videoPath: string,
  maxFrames = 12,
  strategy: "spread" | "embedding" = "spread",
): Promise<ExtractedFrames | null> {
  const { ffmpeg } = binariesAvailable();
  if (!ffmpeg) {
    log.debug("[pond ffmpeg-frame] binary unavailable, skipping", videoPath);
    return null;
  }
  const durationSec = await probeDuration(ffmpeg, videoPath);
  if (durationSec == null) return null;
  const timestamps =
    strategy === "embedding"
      ? embeddingFrameTimestamps(durationSec, maxFrames)
      : sampleFrameTimestamps(durationSec, maxFrames);
  if (timestamps.length === 0) return null;
  const sampledDurationSec =
    strategy === "embedding" ? Math.min(durationSec, 32) : durationSec;

  let outputDir: string | null = null;
  let cleanupCalled = false;
  const cleanup = async () => {
    if (cleanupCalled) return;
    cleanupCalled = true;
    if (outputDir) {
      try {
        await rm(outputDir, { recursive: true, force: true });
      } catch (err) {
        log.warn("[pond ffmpeg-frame] tmpdir cleanup failed", outputDir, err);
      }
    }
  };

  try {
    outputDir = await mkdtemp(join(tmpdir(), "pond-frames-"));
    const paths = timestamps.map((_, index) =>
      join(outputDir ?? "", `frame-${index}.jpg`),
    );
    const inputArgs = timestamps.flatMap((timestamp) => [
      "-ss",
      String(timestamp),
      "-i",
      videoPath,
    ]);
    const outputArgs = paths.flatMap((path, index) => [
      "-map",
      `${index}:v:0`,
      "-frames:v",
      "1",
      "-vf",
      "scale=384:384:force_original_aspect_ratio=increase,crop=384:384",
      "-q:v",
      "4",
      "-f",
      "image2",
      "-update",
      "1",
      path,
    ]);
    const { code, stderr } = await runWithTimeout(
      ffmpeg,
      ["-hide_banner", "-loglevel", "error", "-y", ...inputArgs, ...outputArgs],
      SAMPLE_TIMEOUT_MS,
    );
    if (code !== 0) {
      log.warn(
        "[pond ffmpeg-frame] sample extraction failed",
        code,
        videoPath,
        stderr.slice(-400),
      );
      await cleanup();
      return null;
    }
    const frames = await Promise.all(
      paths.map(async (path) => {
        const { size } = await stat(path);
        return { path, mimeType: "image/jpeg", size };
      }),
    );
    if (frames.some((frame) => frame.size === 0)) {
      await cleanup();
      return null;
    }
    return {
      frames,
      timestamps,
      durationSec: sampledDurationSec,
      cleanup,
    };
  } catch (err) {
    log.warn("[pond ffmpeg-frame] sample extraction error", videoPath, err);
    await cleanup();
    return null;
  }
}

function jpegArgv(
  videoPath: string,
  outPath: string,
  seek: ["before" | "after", string],
): string[] {
  const head =
    seek[0] === "before"
      ? ["-ss", seek[1], "-i", videoPath]
      : ["-i", videoPath, "-ss", seek[1]];
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...head,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    "-f",
    "image2",
    outPath,
  ];
}

async function extractJpeg(
  videoPath: string,
  argvFor: (outPath: string) => string[],
): Promise<ExtractedFrame | null> {
  const { ffmpeg } = binariesAvailable();
  if (!ffmpeg) {
    log.debug("[pond ffmpeg-frame] binary unavailable, skipping", videoPath);
    return null;
  }

  let outputDir: string | null = null;
  let cleanupCalled = false;
  const cleanup = async () => {
    if (cleanupCalled) return;
    cleanupCalled = true;
    if (outputDir) {
      try {
        await rm(outputDir, { recursive: true, force: true });
      } catch (err) {
        log.warn("[pond ffmpeg-frame] tmpdir cleanup failed", outputDir, err);
      }
    }
  };

  try {
    outputDir = await mkdtemp(join(tmpdir(), "pond-frame-"));
    const outPath = join(outputDir, "frame.jpg");
    const { code, stderr } = await runWithTimeout(
      ffmpeg,
      argvFor(outPath),
      HARD_TIMEOUT_MS,
    );
    if (code !== 0) {
      log.warn(
        "[pond ffmpeg-frame] non-zero exit",
        code,
        videoPath,
        stderr.slice(-400),
      );
      await cleanup();
      return null;
    }

    let size = 0;
    try {
      const s = await stat(outPath);
      size = s.size;
    } catch {
      await cleanup();
      return null;
    }
    if (size === 0) {
      log.warn("[pond ffmpeg-frame] produced empty file", videoPath);
      await cleanup();
      return null;
    }

    return {
      path: outPath,
      mimeType: "image/jpeg",
      size,
      cleanup,
    };
  } catch (err) {
    log.warn("[pond ffmpeg-frame] unexpected error", videoPath, err);
    await cleanup();
    return null;
  }
}

async function probeDuration(
  ffmpeg: string,
  videoPath: string,
): Promise<number | null> {
  const { stderr } = await runWithTimeout(
    ffmpeg,
    ["-hide_banner", "-i", videoPath, "-t", "0", "-f", "null", "-"],
    HARD_TIMEOUT_MS,
  );
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const durationSec = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null;
}

interface ProcOutcome {
  code: number;
  stderr: string;
}

function runWithTimeout(
  bin: string,
  argv: string[],
  timeoutMs: number,
): Promise<ProcOutcome> {
  return new Promise((resolve) => {
    const child = spawn(bin, argv, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        killProcessTree(child, "SIGKILL");
      } catch {}
      resolve({ code: 124, stderr: `${stderr}\n[pond ffmpeg-frame] timeout` });
    }, timeoutMs);

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 32_000) stderr = stderr.slice(-32_000);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stderr: String(err) });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}
