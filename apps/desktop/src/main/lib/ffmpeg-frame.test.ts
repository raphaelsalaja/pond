import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { binariesAvailable } from "../core/refresh/binaries";
import {
  embeddingFrameTimestamps,
  extractSampledFrames,
  sampleFrameTimestamps,
} from "./ffmpeg-frame";

function run(bin: string, args: Array<string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
}

describe("video frame sampling", () => {
  it("samples the first thirty-two seconds at one frame per second", () => {
    expect(embeddingFrameTimestamps(3.2, 32)).toEqual([0, 1, 2, 3]);
    const samples = embeddingFrameTimestamps(120, 32);
    expect(samples).toHaveLength(32);
    expect(samples[0]).toBe(0);
    expect(samples[31]).toBe(31);
  });

  it("samples short videos away from duplicate endpoints", () => {
    expect(sampleFrameTimestamps(8, 12)).toEqual([2, 4, 6]);
  });

  it("adds bounded samples as duration grows", () => {
    const samples = sampleFrameTimestamps(300, 12);
    expect(samples).toHaveLength(12);
    expect(samples[0]).toBeCloseTo(300 / 13);
    expect(samples[11]).toBeCloseTo((300 * 12) / 13);
  });

  it("honors the caller cap", () => {
    expect(sampleFrameTimestamps(300, 5)).toHaveLength(5);
    expect(sampleFrameTimestamps(Number.NaN, 12)).toEqual([]);
  });

  it("cleans every extracted frame and fails closed", async () => {
    const ffmpeg = binariesAvailable().ffmpeg;
    if (!ffmpeg) {
      throw new Error("Expected the bundled ffmpeg");
    }
    const root = await mkdtemp(join(tmpdir(), "pond-frame-fixture-"));
    try {
      const video = join(root, "neutral.mp4");
      await run(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=640x480:d=2",
        "-pix_fmt",
        "yuv420p",
        video,
      ]);

      const extracted = await extractSampledFrames(video, 3);
      expect(extracted?.frames).toHaveLength(3);
      const firstPath = extracted?.frames[0]?.path;
      expect(firstPath).toBeDefined();
      await extracted?.cleanup();
      await extracted?.cleanup();
      await expect(stat(firstPath ?? "")).rejects.toThrow();

      const beforeFailure = new Set(
        (await readdir(tmpdir())).filter((name) =>
          name.startsWith("pond-frames-"),
        ),
      );
      const audio = join(root, "audio-only.m4a");
      await run(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=2",
        audio,
      ]);
      await expect(extractSampledFrames(audio, 3)).resolves.toBe(null);
      const afterFailure = new Set(
        (await readdir(tmpdir())).filter((name) =>
          name.startsWith("pond-frames-"),
        ),
      );
      expect(afterFailure).toEqual(beforeFailure);
      await expect(
        extractSampledFrames(join(root, "missing.mp4"), 3),
      ).resolves.toBe(null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
