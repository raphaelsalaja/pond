import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import log from "electron-log/main.js";
import { binariesAvailable } from "../core/refresh/binaries";

/**
 * Extract the first frame of a video file as a JPEG, using the bundled
 * ffmpeg. The output lives in a fresh tmpdir; the caller MUST invoke
 * `cleanup()` (typically in a `finally{}`) to remove it.
 *
 * Why frame 0 (not the platform-supplied cover): the grid card binds
 * `<video poster={…}>` to a sibling image. Without this, the poster is
 * whatever still the harvester captured (YouTube `maxresdefault.jpg`,
 * Twitter's chosen thumbnail, …) — which almost never matches the
 * actual first frame of the saved MP4. Hovering kicks `play()`, the
 * decoder paints frame 0, and the still appears to "swap." Extracting
 * a real frame-0 JPEG and using it as the poster makes the pre-hover
 * state truthful.
 *
 * Returns `null` (and never throws) on:
 *  - ffmpeg binary missing (e.g. corrupted resources, dev without
 *    `ffmpeg-static` installed) — same fall-through the yt-dlp wrapper
 *    uses, so the save lands with `cover` only and no regression.
 *  - Hard timeout (10s) — first-frame extracts on real files are
 *    sub-second, so this only fires when ffmpeg is stuck on a corrupt
 *    container.
 *  - Non-zero exit (unsupported codec the bundled ffmpeg can't demux,
 *    truncated bytes, …). We log at warn so it surfaces in Developer
 *    › Open Log Directory without spamming.
 */

const HARD_TIMEOUT_MS = 10_000;

export interface ExtractedFrame {
  /** Absolute path to the JPEG. Lives inside our tmpdir. */
  path: string;
  /** Always `image/jpeg`. */
  mimeType: string;
  /** File size in bytes. */
  size: number;
  /** Caller MUST invoke this in a `finally{}` to remove the tmpdir. */
  cleanup: () => Promise<void>;
}

export async function extractFirstFrame(
  videoPath: string,
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

    // -ss 0 before -i is a "fast seek" to the keyframe at/before t=0,
    // which for almost every container is the actual first frame.
    // -frames:v 1 stops after one decoded video frame so we don't
    // waste cycles. -q:v 3 lands around 80% JPEG quality (1=best,
    // 31=worst); good enough for a 300px-wide card thumb and keeps
    // the file at ~10–40 KB.
    const argv = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      "0",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      "-f",
      "image2",
      outPath,
    ];

    const { code, stderr } = await runWithTimeout(
      ffmpeg,
      argv,
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
    const child = spawn(bin, argv, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* already exited */
      }
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
