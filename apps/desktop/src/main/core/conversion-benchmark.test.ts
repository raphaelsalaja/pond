import { randomFillSync } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { expect, it } from "vitest";
import { ConversionPresetSchema } from "../../shared/conversion-contracts";
import type { ConversionFormat } from "../../shared/conversion-contracts";
import { conversionCapabilities } from "./conversion-capabilities";
import { convertMedia } from "./convert-media";

it.skipIf(process.env.POND_BENCH_CONVERSION !== "1")(
  "benchmarks a bounded representative conversion matrix",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "pond-conversion-bench-"));
    try {
      const width = 1024;
      const height = 1024;
      const pixels = randomFillSync(Buffer.alloc(width * height * 3));
      const source = join(directory, "source.png");
      await sharp(pixels, { raw: { width, height, channels: 3 } })
        .png({ compressionLevel: 0 })
        .toFile(source);
      const capabilities = await conversionCapabilities({ ffmpegPath });
      const wanted: Array<ConversionFormat> = [
        "webp",
        "avif",
        "tiff",
        "bmp",
        "exr",
      ];
      const results: Array<{
        format: ConversionFormat;
        milliseconds: number;
        bytes: number;
      }> = [];
      const began = performance.now();
      for (const format of wanted) {
        if (
          !capabilities.some(
            (capability) =>
              capability.format === format && capability.available,
          )
        ) {
          continue;
        }
        const started = performance.now();
        const output = await convertMedia({
          source,
          directory,
          ffmpegPath: ffmpegPath ?? undefined,
          preset: ConversionPresetSchema.parse({
            id: format,
            name: format.toUpperCase(),
            format,
            quality: 80,
          }),
          signal: new AbortController().signal,
        });
        const milliseconds = performance.now() - started;
        results.push({
          format,
          milliseconds: Math.round(milliseconds),
          bytes: (await stat(output)).size,
        });
        expect(milliseconds).toBeLessThan(30_000);
      }
      const totalMilliseconds = performance.now() - began;
      expect(results.length).toBeGreaterThanOrEqual(4);
      expect(totalMilliseconds).toBeLessThan(60_000);
      process.stdout.write(
        `${JSON.stringify({
          source: { width, height },
          totalMilliseconds: Math.round(totalMilliseconds),
          results,
        })}\n`,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  65_000,
);
