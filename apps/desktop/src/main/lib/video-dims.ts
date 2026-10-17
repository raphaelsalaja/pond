import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import log from "electron-log/main.js";
import { binariesAvailable } from "../core/refresh/binaries";
import { killProcessTree } from "./process-tree";
import { frameRateFromProbe } from "./video-timing";

const HARD_TIMEOUT_MS = 10_000;

async function probeVideoMetadata(
  videoPath: string,
): Promise<{ width: number; height: number; frameRate: number | null } | null> {
  const { ffmpeg } = binariesAvailable();
  if (!ffmpeg) {
    log.debug("[pond video-dims] ffmpeg unavailable", videoPath);
    return null;
  }

  const { code, stderr } = await runFfmpegProbe(ffmpeg, videoPath);
  if (code !== 0 && code !== 1) {
    /** ffmpeg returns 1 when invoked as a probe (no output file). */
    log.debug("[pond video-dims] probe failed", videoPath, code);
  }

  const size = stderr.match(/Video:.*?\s(\d{2,5})x(\d{2,5})/);
  if (!size) return null;
  let width = Number(size[1]);
  let height = Number(size[2]);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  const rotation =
    stderr.match(/rotation of (-?\d+(?:\.\d+)?)/i) ??
    stderr.match(/rotate\s*:\s*(-?\d+)/i);
  if (rotation) {
    const degrees = Math.abs(Number(rotation[1])) % 180;
    if (degrees === 90) {
      const swapped = width;
      width = height;
      height = swapped;
    }
  }

  return { width, height, frameRate: frameRateFromProbe(stderr) };
}

function runFfmpegProbe(
  bin: string,
  videoPath: string,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-hide_banner", "-i", videoPath], {
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
      resolve({ code: 124, stderr });
    }, HARD_TIMEOUT_MS);

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
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

type VideoMetadata = Awaited<ReturnType<typeof probeVideoMetadata>>;
const probes = new Map<string, Promise<VideoMetadata>>();
export async function probeVideoDims(
  videoPath: string,
): Promise<VideoMetadata> {
  const info = await stat(videoPath).catch(() => null);
  if (!info) return null;
  const key = `${videoPath}:${info.size}:${info.mtimeMs}`;
  const existing = probes.get(key);
  if (existing) return existing;
  const probe = probeVideoMetadata(videoPath);
  probes.set(key, probe);
  if (probes.size > 128) {
    const oldest = probes.keys().next().value;
    if (oldest) probes.delete(oldest);
  }
  const result = await probe;
  if (!result) probes.delete(key);
  return result;
}
