import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { expect, it } from "vitest";
import { ConversionPresetSchema } from "../../shared/conversion-contracts";
import { buildFfmpegConversionArguments, convertMedia } from "./convert-media";

it("builds codec-specific JXL and ICO adapter arguments", () => {
  const jxl = buildFfmpegConversionArguments(
    ConversionPresetSchema.parse({
      id: "jxl",
      name: "JXL",
      format: "jxl",
      lossless: true,
    }),
    "source.png",
    "output.jxl",
  );
  expect(jxl).toEqual(
    expect.arrayContaining(["-c:v", "libjxl", "-distance", "0"]),
  );
  const ico = buildFfmpegConversionArguments(
    ConversionPresetSchema.parse({
      id: "ico",
      name: "ICO",
      format: "ico",
      width: 64,
      height: 64,
    }),
    "source.png",
    "output.ico",
  );
  expect(ico).toEqual(expect.arrayContaining(["-c:v", "png", "-f", "ico"]));
});

it("resizes and converts copies with collision-safe names while preserving the original", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pond-convert-test-"));
  try {
    const source = join(directory, "photo.png");
    await sharp({
      create: { width: 80, height: 40, channels: 3, background: "red" },
    })
      .png()
      .toFile(source);
    const original = await readFile(source);
    const preset = ConversionPresetSchema.parse({
      id: "web",
      name: "Web",
      format: "webp",
      width: 20,
    });
    const input = {
      source,
      directory,
      preset,
      signal: new AbortController().signal,
    };
    const first = await convertMedia(input);
    const second = await convertMedia(input);
    expect(first).not.toBe(second);
    /** Reading bytes first avoids holding a Windows file handle during cleanup. */
    const metadata = await sharp(await readFile(first)).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(20);
    expect(metadata.height).toBe(10);
    expect(await readFile(source)).toEqual(original);
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      convertMedia({ ...input, signal: aborted.signal }),
    ).rejects.toThrow();
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
});

it.skipIf(!ffmpegPath)(
  "converts a local video clip into a correctly sized animated GIF",
  async () => {
    const ffmpeg = ffmpegPath;
    if (!ffmpeg) throw new Error("FFmpeg unavailable");
    const directory = await mkdtemp(join(tmpdir(), "pond-gif-test-"));
    try {
      const source = join(directory, "clip.mp4");
      await promisify(execFile)(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=80x40:rate=10",
        "-t",
        "1",
        "-pix_fmt",
        "yuv420p",
        source,
      ]);
      const preset = ConversionPresetSchema.parse({
        id: "gif",
        name: "GIF",
        format: "gif",
        width: 40,
        duration: 0.5,
        fps: 10,
      });
      const output = await convertMedia({
        source,
        ffmpegPath: ffmpeg,
        directory,
        preset,
        signal: new AbortController().signal,
      });
      const metadata = await sharp(output, { animated: true }).metadata();
      expect(metadata.format).toBe("gif");
      expect(metadata.width).toBe(40);
      expect(metadata.pageHeight).toBe(20);
      expect(metadata.pages).toBe(5);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it.skipIf(!ffmpegPath)(
  "exports installed professional still-image formats through FFmpeg",
  async () => {
    const ffmpeg = ffmpegPath;
    if (!ffmpeg) throw new Error("FFmpeg unavailable");
    const directory = await mkdtemp(join(tmpdir(), "pond-pro-format-test-"));
    try {
      const source = join(directory, "source.png");
      await sharp({
        create: {
          width: 32,
          height: 16,
          channels: 4,
          background: { r: 10, g: 20, b: 30, alpha: 1 },
        },
      })
        .png()
        .toFile(source);
      for (const format of ["exr", "hdr", "tga", "bmp", "ico"] as const) {
        const output = await convertMedia({
          source,
          ffmpegPath: ffmpeg,
          directory,
          preset: ConversionPresetSchema.parse({
            id: format,
            name: format.toUpperCase(),
            format,
          }),
          signal: new AbortController().signal,
        });
        await promisify(execFile)(ffmpeg, [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          output,
          "-f",
          "null",
          "-",
        ]);
        expect((await readFile(output)).byteLength).toBeGreaterThan(0);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it.skipIf(!ffmpegPath)(
  "rejects professional formats that fail runtime validation",
  async () => {
    const ffmpeg = ffmpegPath;
    if (!ffmpeg) throw new Error("FFmpeg unavailable");
    const directory = await mkdtemp(join(tmpdir(), "pond-pro-gate-test-"));
    try {
      const source = join(directory, "source.png");
      await sharp({
        create: { width: 2, height: 2, channels: 3, background: "red" },
      })
        .png()
        .toFile(source);
      for (const format of ["jxl", "heic", "heif"] as const) {
        await expect(
          convertMedia({
            source,
            ffmpegPath: ffmpeg,
            directory,
            preset: ConversionPresetSchema.parse({
              id: format,
              name: format.toUpperCase(),
              format,
            }),
            signal: new AbortController().signal,
          }),
        ).rejects.toThrow(/Sharp/);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
