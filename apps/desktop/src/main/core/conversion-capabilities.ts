import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import type {
  ConversionCapability,
  ConversionFormat,
} from "../../shared/conversion-contracts";
import { binariesAvailable } from "./refresh/binaries";

interface FormatDefinition {
  format: ConversionFormat;
  category: ConversionCapability["category"];
  adapter: ConversionCapability["adapter"];
  extension: string;
  mimeType: string;
  encoders: ReadonlyArray<string>;
  muxers: ReadonlyArray<string>;
  sharpFormat: string | null;
  supportsLossless: boolean;
  ffmpegFallback?: {
    encoders: ReadonlyArray<string>;
    muxers: ReadonlyArray<string>;
  };
}

const CONVERSION_FORMATS: ReadonlyArray<FormatDefinition> = [
  {
    format: "jpeg",
    category: "image",
    adapter: "sharp",
    extension: "jpg",
    mimeType: "image/jpeg",
    encoders: [],
    muxers: [],
    sharpFormat: "jpeg",
    supportsLossless: false,
  },
  {
    format: "png",
    category: "image",
    adapter: "sharp",
    extension: "png",
    mimeType: "image/png",
    encoders: [],
    muxers: [],
    sharpFormat: "png",
    supportsLossless: true,
  },
  {
    format: "webp",
    category: "image",
    adapter: "sharp",
    extension: "webp",
    mimeType: "image/webp",
    encoders: [],
    muxers: [],
    sharpFormat: "webp",
    supportsLossless: true,
  },
  {
    format: "avif",
    category: "image",
    adapter: "sharp",
    extension: "avif",
    mimeType: "image/avif",
    encoders: [],
    muxers: [],
    sharpFormat: "heif",
    supportsLossless: true,
  },
  {
    format: "tiff",
    category: "image",
    adapter: "sharp",
    extension: "tiff",
    mimeType: "image/tiff",
    encoders: [],
    muxers: [],
    sharpFormat: "tiff",
    supportsLossless: true,
  },
  {
    format: "jxl",
    category: "image",
    adapter: "sharp",
    extension: "jxl",
    mimeType: "image/jxl",
    encoders: [],
    muxers: [],
    sharpFormat: "jxl",
    supportsLossless: true,
    ffmpegFallback: {
      encoders: ["libjxl"],
      muxers: ["image2"],
    },
  },
  {
    format: "heic",
    category: "image",
    adapter: "sharp",
    extension: "heic",
    mimeType: "image/heic",
    encoders: [],
    muxers: [],
    sharpFormat: "heif",
    supportsLossless: true,
  },
  {
    format: "heif",
    category: "image",
    adapter: "sharp",
    extension: "heif",
    mimeType: "image/heif",
    encoders: [],
    muxers: [],
    sharpFormat: "heif",
    supportsLossless: true,
  },
  {
    format: "exr",
    category: "image",
    adapter: "ffmpeg",
    extension: "exr",
    mimeType: "image/x-exr",
    encoders: ["exr"],
    muxers: ["image2"],
    sharpFormat: null,
    supportsLossless: true,
  },
  {
    format: "hdr",
    category: "image",
    adapter: "ffmpeg",
    extension: "hdr",
    mimeType: "image/vnd.radiance",
    encoders: ["hdr"],
    muxers: ["image2"],
    sharpFormat: null,
    supportsLossless: false,
  },
  {
    format: "tga",
    category: "image",
    adapter: "ffmpeg",
    extension: "tga",
    mimeType: "image/x-tga",
    encoders: ["targa"],
    muxers: ["image2"],
    sharpFormat: null,
    supportsLossless: true,
  },
  {
    format: "bmp",
    category: "image",
    adapter: "ffmpeg",
    extension: "bmp",
    mimeType: "image/bmp",
    encoders: ["bmp"],
    muxers: ["image2"],
    sharpFormat: null,
    supportsLossless: true,
  },
  {
    format: "ico",
    category: "image",
    adapter: "ffmpeg",
    extension: "ico",
    mimeType: "image/x-icon",
    encoders: ["png"],
    muxers: ["ico"],
    sharpFormat: null,
    supportsLossless: true,
  },
  {
    format: "gif",
    category: "animation",
    adapter: "ffmpeg",
    extension: "gif",
    mimeType: "image/gif",
    encoders: ["gif"],
    muxers: ["gif"],
    sharpFormat: null,
    supportsLossless: false,
  },
  {
    format: "apng",
    category: "animation",
    adapter: "ffmpeg",
    extension: "png",
    mimeType: "image/apng",
    encoders: ["apng"],
    muxers: ["apng"],
    sharpFormat: null,
    supportsLossless: true,
  },
  {
    format: "animated-webp",
    category: "animation",
    adapter: "ffmpeg",
    extension: "webp",
    mimeType: "image/webp",
    encoders: ["libwebp_anim"],
    muxers: ["webp"],
    sharpFormat: null,
    supportsLossless: true,
  },
  {
    format: "mp4",
    category: "video",
    adapter: "ffmpeg",
    extension: "mp4",
    mimeType: "video/mp4",
    encoders: ["libx264", "aac"],
    muxers: ["mp4"],
    sharpFormat: null,
    supportsLossless: false,
  },
  {
    format: "webm",
    category: "video",
    adapter: "ffmpeg",
    extension: "webm",
    mimeType: "video/webm",
    encoders: ["libvpx-vp9", "libopus"],
    muxers: ["webm"],
    sharpFormat: null,
    supportsLossless: false,
  },
];

export function createConversionCapabilities(input: {
  sharpOutputs: ReadonlySet<string>;
  sharpAdapters?: ReadonlySet<ConversionFormat>;
  ffmpegAvailable: boolean;
  ffmpegEncoders: ReadonlySet<string>;
  ffmpegMuxers: ReadonlySet<string>;
}): Array<ConversionCapability> {
  return CONVERSION_FORMATS.map((definition) => {
    const sharpOutputAvailable = Boolean(
      definition.sharpFormat && input.sharpOutputs.has(definition.sharpFormat),
    );
    const sharpAdapterAvailable =
      !input.sharpAdapters || input.sharpAdapters.has(definition.format);
    const sharpAvailable =
      definition.adapter === "sharp" &&
      sharpOutputAvailable &&
      sharpAdapterAvailable;
    const ffmpeg = definition.ffmpegFallback ?? {
      encoders: definition.encoders,
      muxers: definition.muxers,
    };
    const ffmpegAvailable = Boolean(
      input.ffmpegAvailable &&
      ffmpeg.encoders.every((encoder) => input.ffmpegEncoders.has(encoder)) &&
      ffmpeg.muxers.every((muxer) => input.ffmpegMuxers.has(muxer)),
    );
    const canUseFfmpeg =
      (definition.adapter === "ffmpeg" || Boolean(definition.ffmpegFallback)) &&
      ffmpegAvailable;
    const available = sharpAvailable || canUseFfmpeg;
    const missingEncoders = ffmpeg.encoders.filter(
      (encoder) => !input.ffmpegEncoders.has(encoder),
    );
    const missingMuxers = ffmpeg.muxers.filter(
      (muxer) => !input.ffmpegMuxers.has(muxer),
    );
    const missingFfmpeg = [
      ...missingEncoders.map((encoder) => `encoder ${encoder}`),
      ...missingMuxers.map((muxer) => `muxer ${muxer}`),
    ];
    return {
      format: definition.format,
      category: definition.category,
      adapter: sharpAvailable
        ? "sharp"
        : definition.ffmpegFallback
          ? "ffmpeg"
          : definition.adapter,
      extension: definition.extension,
      mimeType: definition.mimeType,
      available,
      unavailableReason: available
        ? null
        : definition.adapter === "sharp"
          ? definition.ffmpegFallback
            ? `${
                sharpOutputAvailable
                  ? `Sharp's ${definition.format} encoder failed runtime validation.`
                  : `Sharp cannot encode ${definition.format} in this build.`
              } ${
                input.ffmpegAvailable
                  ? `FFmpeg does not provide ${missingFfmpeg.join(", ")}.`
                  : "FFmpeg is unavailable."
              }`
            : sharpOutputAvailable
              ? `Sharp's ${definition.format} encoder failed runtime validation.`
              : `Sharp cannot encode ${definition.format} in this build.`
          : input.ffmpegAvailable
            ? `FFmpeg does not provide ${missingFfmpeg.join(", ")}.`
            : "FFmpeg is unavailable.",
      supportsLossless: definition.supportsLossless,
    };
  });
}

let cached:
  | {
      ffmpegPath: string | null;
      value: Promise<Array<ConversionCapability>>;
    }
  | undefined;

export function conversionCapabilities(input?: {
  ffmpegPath?: string | null;
}): Promise<Array<ConversionCapability>> {
  const ffmpegPath = input?.ffmpegPath ?? binariesAvailable().ffmpeg;
  if (cached?.ffmpegPath === ffmpegPath) {
    return cached.value;
  }
  const value = loadConversionCapabilities(ffmpegPath);
  cached = { ffmpegPath, value };
  return value;
}

function isSharpFormat(format: string): format is keyof typeof sharp.format {
  return Object.hasOwn(sharp.format, format);
}

async function loadConversionCapabilities(
  ffmpegPath: string | null,
): Promise<Array<ConversionCapability>> {
  const sharpOutputs = new Set(
    Object.keys(sharp.format).filter((format) => {
      if (!isSharpFormat(format)) {
        return false;
      }
      const { output } = sharp.format[format];
      return Boolean(output.file || output.buffer || output.stream);
    }),
  );
  const sharpAdapters = new Set<ConversionFormat>();
  const probes: Array<Promise<void>> = [];
  for (const definition of CONVERSION_FORMATS) {
    if (
      definition.adapter === "sharp" &&
      definition.sharpFormat &&
      sharpOutputs.has(definition.sharpFormat)
    ) {
      probes.push(
        probeSharpAdapter(definition.format).then((available) => {
          if (available) {
            sharpAdapters.add(definition.format);
          }
        }),
      );
    }
  }
  await Promise.all(probes);
  const [ffmpegEncoders, ffmpegMuxers] = ffmpegPath
    ? await Promise.all([
        readFfmpegList(ffmpegPath, "-encoders", /^\s*[A-Z.]{6}\s+(\S+)/),
        readFfmpegList(ffmpegPath, "-muxers", /^\s*E\s+(\S+)/),
      ])
    : [new Set<string>(), new Set<string>()];
  return createConversionCapabilities({
    sharpOutputs,
    sharpAdapters,
    ffmpegAvailable: Boolean(ffmpegPath),
    ffmpegEncoders,
    ffmpegMuxers,
  });
}

async function readFfmpegList(
  path: string,
  option: "-encoders" | "-muxers",
  pattern: RegExp,
): Promise<Set<string>> {
  try {
    const { stdout } = await promisify(execFile)(
      path,
      ["-hide_banner", option],
      { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const values = new Set<string>();
    for (const line of stdout.split("\n")) {
      const match = pattern.exec(line);
      if (match?.[1]) {
        for (const value of match[1].split(",")) {
          values.add(value);
        }
      }
    }
    return values;
  } catch {
    return new Set();
  }
}

async function probeSharpAdapter(format: ConversionFormat): Promise<boolean> {
  try {
    const image = sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    });
    switch (format) {
      case "jpeg":
        await image.jpeg().toBuffer();
        return true;
      case "png":
        await image.png().toBuffer();
        return true;
      case "webp":
        await image.webp().toBuffer();
        return true;
      case "avif":
        await image.avif().toBuffer();
        return true;
      case "tiff":
        await image.tiff().toBuffer();
        return true;
      case "jxl":
        await image.jxl().toBuffer();
        return true;
      case "heic":
      case "heif":
        await image.heif({ compression: "hevc" }).toBuffer();
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export async function requireConversionCapability(
  format: ConversionFormat,
  ffmpegPath?: string,
): Promise<ConversionCapability> {
  const capabilities = await conversionCapabilities({ ffmpegPath });
  const capability = capabilities.find((item) => item.format === format);
  if (!capability) {
    throw new Error(`Unsupported conversion format: ${format}.`);
  }
  if (!capability.available) {
    throw new Error(
      capability.unavailableReason ?? `${format} conversion is unavailable.`,
    );
  }
  return capability;
}
