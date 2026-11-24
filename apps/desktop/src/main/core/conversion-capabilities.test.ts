import ffmpegPath from "ffmpeg-static";
import { expect, it } from "vitest";
import {
  conversionCapabilities,
  createConversionCapabilities,
} from "./conversion-capabilities";

it("reports Sharp and FFmpeg formats from their runtime codec sets", () => {
  const capabilities = createConversionCapabilities({
    sharpOutputs: new Set(["jpeg", "png", "webp"]),
    ffmpegAvailable: true,
    ffmpegEncoders: new Set(["gif", "libx264", "aac"]),
    ffmpegMuxers: new Set(["gif", "mp4", "webm"]),
  });
  expect(
    capabilities.find((capability) => capability.format === "webp"),
  ).toMatchObject({ available: true, adapter: "sharp" });
  expect(
    capabilities.find((capability) => capability.format === "gif"),
  ).toMatchObject({ available: true, adapter: "ffmpeg" });
  expect(
    capabilities.find((capability) => capability.format === "mp4"),
  ).toMatchObject({ available: true, adapter: "ffmpeg" });
  expect(
    capabilities.find((capability) => capability.format === "webm"),
  ).toMatchObject({
    available: false,
    unavailableReason:
      "FFmpeg does not provide encoder libvpx-vp9, encoder libopus.",
  });
});

it("keeps unavailable codecs visible with an actionable reason", () => {
  const capabilities = createConversionCapabilities({
    sharpOutputs: new Set(["jpeg"]),
    ffmpegAvailable: false,
    ffmpegEncoders: new Set(),
    ffmpegMuxers: new Set(),
  });
  expect(
    capabilities.find((capability) => capability.format === "avif"),
  ).toMatchObject({
    available: false,
    unavailableReason: "Sharp cannot encode avif in this build.",
  });
  expect(
    capabilities.find((capability) => capability.format === "gif"),
  ).toMatchObject({
    available: false,
    unavailableReason: "FFmpeg is unavailable.",
  });
});

it("gates professional formats on validated Sharp adapters and FFmpeg muxers", () => {
  const capabilities = createConversionCapabilities({
    sharpOutputs: new Set(["jxl", "heif"]),
    sharpAdapters: new Set(["jxl"]),
    ffmpegAvailable: true,
    ffmpegEncoders: new Set(["exr", "hdr", "targa", "bmp", "png"]),
    ffmpegMuxers: new Set(["image2", "ico"]),
  });
  for (const format of ["exr", "hdr", "tga", "bmp", "ico", "jxl"] as const) {
    expect(
      capabilities.find((capability) => capability.format === format),
    ).toMatchObject({ available: true });
  }
  for (const format of ["heic", "heif"] as const) {
    expect(
      capabilities.find((capability) => capability.format === format),
    ).toMatchObject({
      available: false,
      unavailableReason: `Sharp's ${format} encoder failed runtime validation.`,
    });
  }
});

it("reports a missing FFmpeg muxer even when the encoder is installed", () => {
  const capability = createConversionCapabilities({
    sharpOutputs: new Set(),
    ffmpegAvailable: true,
    ffmpegEncoders: new Set(["png"]),
    ffmpegMuxers: new Set(),
  }).find((item) => item.format === "ico");
  expect(capability).toMatchObject({
    available: false,
    unavailableReason: "FFmpeg does not provide muxer ico.",
  });
});

it("falls back to FFmpeg for JXL when Sharp cannot encode it", () => {
  const capability = createConversionCapabilities({
    sharpOutputs: new Set(),
    ffmpegAvailable: true,
    ffmpegEncoders: new Set(["libjxl"]),
    ffmpegMuxers: new Set(["image2"]),
  }).find((item) => item.format === "jxl");
  expect(capability).toMatchObject({
    adapter: "ffmpeg",
    available: true,
    unavailableReason: null,
  });
});

it.skipIf(!ffmpegPath)(
  "validates the installed professional encoders instead of assuming support",
  async () => {
    const capabilities = await conversionCapabilities({ ffmpegPath });
    expect(
      capabilities.find((capability) => capability.format === "avif"),
    ).toMatchObject({ available: true, adapter: "sharp" });
    for (const format of ["exr", "hdr", "tga", "bmp", "ico"] as const) {
      expect(
        capabilities.find((capability) => capability.format === format),
      ).toMatchObject({ available: true, adapter: "ffmpeg" });
    }
    expect(
      capabilities.find((capability) => capability.format === "jxl"),
    ).toMatchObject({
      available: false,
      unavailableReason:
        "Sharp cannot encode jxl in this build. FFmpeg does not provide encoder libjxl.",
    });
    for (const format of ["heic", "heif"] as const) {
      expect(
        capabilities.find((capability) => capability.format === format),
      ).toMatchObject({
        available: false,
        unavailableReason: `Sharp's ${format} encoder failed runtime validation.`,
      });
    }
  },
);
