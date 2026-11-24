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
  timestamps: Array<number>;
  durationSec: number;
  cleanup: () => Promise<void>;
}

export function sampleFrameTimestamps(
  durationSec: number,
  maxFrames: number,
): Array<number> {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return [];
  }
  const cap = Math.min(12, Math.max(3, Math.floor(maxFrames)));
  const count = Math.min(cap, Math.max(3, Math.ceil(durationSec / 30) + 2));
  return Array.from({ length: count }, (_, index) =>
    Number((((index + 1) * durationSec) / (count + 1)).toFixed(3)),
  );
}

export function embeddingFrameTimestamps(
  durationSec: number,
  maxFrames = 32,
): Array<number> {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return [];
  }
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
  if (durationSec === null) {
    return null;
  }
  const timestamps =
    strategy === "embedding"
      ? embeddingFrameTimestamps(durationSec, maxFrames)
      : sampleFrameTimestamps(durationSec, maxFrames);
  if (timestamps.length === 0) {
    return null;
  }
  const sampledDurationSec =
    strategy === "embedding" ? Math.min(durationSec, 32) : durationSec;

  let outputDir: string | null = null;
  let cleanupCalled = false;
  const cleanup = async () => {
    if (cleanupCalled) {
      return;
    }
    cleanupCalled = true;
    if (outputDir) {
      try {
        await rm(outputDir, { recursive: true, force: true });
      } catch (error) {
        log.warn("[pond ffmpeg-frame] tmpdir cleanup failed", outputDir, error);
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
    const samplingArgs =
      strategy === "embedding"
        ? [
            "-threads",
            "2",
            "-i",
            videoPath,
            "-vf",
            "fps=1:start_time=0:round=up:eof_action=pass,scale=384:384:force_original_aspect_ratio=increase,crop=384:384",
            "-vsync",
            "vfr",
            "-frames:v",
            String(timestamps.length),
            "-q:v",
            "4",
            "-start_number",
            "0",
            join(outputDir, "frame-%d.jpg"),
          ]
        : [...inputArgs, ...outputArgs];
    const { code, stderr } = await runWithTimeout(
      ffmpeg,
      ["-hide_banner", "-loglevel", "error", "-y", ...samplingArgs],
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
  } catch (error) {
    log.warn("[pond ffmpeg-frame] sample extraction error", videoPath, error);
    await cleanup();
    return null;
  }
}

function jpegArgv(
  videoPath: string,
  outPath: string,
  seek: ["before" | "after", string],
): Array<string> {
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
  argvFor: (outPath: string) => Array<string>,
): Promise<ExtractedFrame | null> {
  const { ffmpeg } = binariesAvailable();
  if (!ffmpeg) {
    log.debug("[pond ffmpeg-frame] binary unavailable, skipping", videoPath);
    return null;
  }

  let outputDir: string | null = null;
  let cleanupCalled = false;
  const cleanup = async () => {
    if (cleanupCalled) {
      return;
    }
    cleanupCalled = true;
    if (outputDir) {
      try {
        await rm(outputDir, { recursive: true, force: true });
      } catch (error) {
        log.warn("[pond ffmpeg-frame] tmpdir cleanup failed", outputDir, error);
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
  } catch (error) {
    log.warn("[pond ffmpeg-frame] unexpected error", videoPath, error);
    await cleanup();
    return null;
  }
}

export async function probeMediaDuration(path: string): Promise<number | null> {
  const { ffmpeg } = binariesAvailable();
  return ffmpeg ? probeDuration(ffmpeg, path) : null;
}

const GRAY_TIMEOUT_MS = 120_000;

/** Decodes evenly spaced frames straight to tiny greyscale buffers over a pipe, so nothing touches disk. */
export async function sampleGrayFrames(
  videoPath: string,
  options: {
    windowSeconds: number;
    count: number;
    width: number;
    height: number;
  },
): Promise<Array<Uint8Array> | null> {
  const { ffmpeg } = binariesAvailable();
  if (!ffmpeg) {
    return null;
  }
  const { windowSeconds, count, width, height } = options;
  if (!(windowSeconds > 0) || count < 1) {
    return null;
  }
  const frameBytes = width * height;
  const outcome = await runCapturingStdout(
    ffmpeg,
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-threads",
      "1",
      "-i",
      videoPath,
      "-t",
      String(windowSeconds),
      "-an",
      "-sn",
      "-dn",
      "-vf",
      `fps=${(count / windowSeconds).toFixed(6)},scale=${width}:${height}:flags=area,format=gray`,
      "-frames:v",
      String(count),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "pipe:1",
    ],
    GRAY_TIMEOUT_MS,
    (count + 1) * frameBytes,
  );
  if (outcome.code !== 0) {
    log.warn(
      "[pond ffmpeg-frame] gray sampling failed",
      outcome.code,
      videoPath,
      outcome.stderr.slice(-400),
    );
    return null;
  }
  const frames: Array<Uint8Array> = [];
  for (
    let offset = 0;
    offset + frameBytes <= outcome.stdout.length && frames.length < count;
    offset += frameBytes
  ) {
    frames.push(
      Uint8Array.from(outcome.stdout.subarray(offset, offset + frameBytes)),
    );
  }
  return frames;
}

function runCapturingStdout(
  bin: string,
  argv: Array<string>,
  timeoutMs: number,
  byteLimit: number,
): Promise<ProcOutcome & { stdout: Buffer }> {
  return new Promise((resolve) => {
    const child = spawn(bin, argv, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const chunks: Array<Buffer> = [];
    let bytes = 0;
    let stderr = "";
    let settled = false;
    const finish = (code: number, note = "") => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        stderr: note ? `${stderr}\n${note}` : stderr,
        stdout: Buffer.concat(chunks, Math.min(bytes, byteLimit)),
      });
    };
    const kill = (code: number, note: string) => {
      try {
        killProcessTree(child, "SIGKILL");
      } catch {
        /** The process may already have exited. */
      }
      finish(code, note);
    };
    const timer = setTimeout(
      () => kill(124, "[pond ffmpeg-frame] timeout"),
      timeoutMs,
    );
    child.stdout?.on("data", (chunk: Buffer) => {
      if (bytes + chunk.length > byteLimit) {
        kill(125, "[pond ffmpeg-frame] output budget exceeded");
        return;
      }
      bytes += chunk.length;
      chunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-8000);
    });
    child.on("error", (err) => finish(-1, String(err)));
    child.on("close", (code) => finish(code ?? -1));
  });
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
  if (!match) {
    return null;
  }
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
  argv: Array<string>,
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
      if (settled) {
        return;
      }
      settled = true;
      try {
        killProcessTree(child, "SIGKILL");
      } catch {
        /** The process may already have exited. */
      }
      resolve({ code: 124, stderr: `${stderr}\n[pond ffmpeg-frame] timeout` });
    }, timeoutMs);

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 32_000) {
        stderr = stderr.slice(-32_000);
      }
    });
    child.on("error", (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stderr: String(err) });
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}
