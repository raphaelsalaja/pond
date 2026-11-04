import type {
  ImageDownloadSettings,
  Source,
  SourceOverrides,
  StoredImageDownload,
  StoredVideoDownload,
  VideoDownloadSettings,
} from "@pond/schema/db";
import { EXTERNAL_SOURCE_IDS, type ExternalSource } from "@pond/schema/sources";
import { z } from "zod";

const ALLOWED_HEIGHTS = new Set([
  144, 240, 360, 480, 720, 1080, 1440, 2160, 4320,
]);
const ALLOWED_FPS = new Set([24, 30, 60]);
const ALLOWED_LONG_EDGES = new Set([1024, 2048, 4096, 8192]);

const VIDEO_CODECS = ["h264", "hevc", "av1", "vp9", "any"] as const;
const AUDIO_CODECS = ["aac", "opus", "any"] as const;
const VIDEO_CONTAINERS = ["auto", "mp4", "mkv", "webm", "mov"] as const;
const SUBTITLE_MODES = ["off", "download", "embed"] as const;
const IMAGE_FORMATS = ["original", "jpeg", "png", "webp", "avif"] as const;

const StoredVideoSettingsSchema = z.object({
  autoDownload: z.boolean().optional().catch(undefined),
  maxHeight: z.number().nullish().catch(undefined),
  maxFps: z.number().nullish().catch(undefined),
  videoCodec: z.enum(VIDEO_CODECS).optional().catch(undefined),
  audioCodec: z.enum(AUDIO_CODECS).optional().catch(undefined),
  container: z.enum(VIDEO_CONTAINERS).optional().catch(undefined),
  maxFileSizeMb: z.number().nullish().catch(undefined),
  subtitles: z.enum(SUBTITLE_MODES).optional().catch(undefined),
  subtitleLang: z.string().trim().min(1).optional().catch(undefined),
  embedMetadata: z.boolean().optional().catch(undefined),
  embedThumbnail: z.boolean().optional().catch(undefined),
  embedChapters: z.boolean().optional().catch(undefined),
  sponsorblockRemove: z.boolean().optional().catch(undefined),
});

const StoredImageSettingsSchema = z.object({
  maxLongEdge: z.number().nullish().catch(undefined),
  format: z.enum(IMAGE_FORMATS).optional().catch(undefined),
  quality: z.number().optional().catch(undefined),
  lossless: z.boolean().optional().catch(undefined),
  progressive: z.boolean().optional().catch(undefined),
  preserveMetadata: z.boolean().optional().catch(undefined),
  maxFileSizeMb: z.number().nullish().catch(undefined),
  splitPosts: z.boolean().optional().catch(undefined),
});

function snapToSet(
  value: number | null | undefined,
  set: Set<number>,
  fallback: number,
): number | null {
  if (value === null || value === undefined) return null;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (set.has(n)) return n;
  let best = fallback;
  let bestDelta = Math.abs(best - n);
  for (const bucket of set) {
    const d = Math.abs(bucket - n);
    if (d < bestDelta) {
      best = bucket;
      bestDelta = d;
    }
  }
  return best;
}

export function normalizeVideo(
  input: z.input<typeof StoredVideoSettingsSchema>,
): VideoDownloadSettings {
  const stored = StoredVideoSettingsSchema.catch({}).parse(input);
  return {
    autoDownload: stored.autoDownload ?? false,
    maxHeight: snapToSet(stored.maxHeight, ALLOWED_HEIGHTS, 1080),
    maxFps: snapToSet(stored.maxFps, ALLOWED_FPS, 60),
    videoCodec: stored.videoCodec ?? "h264",
    audioCodec: stored.audioCodec ?? "aac",
    container: stored.container ?? "auto",
    maxFileSizeMb: clampFilesize(stored.maxFileSizeMb, 10_000),
    subtitles: stored.subtitles ?? "off",
    subtitleLang: stored.subtitleLang ?? "en",
    embedMetadata: stored.embedMetadata ?? true,
    embedThumbnail: stored.embedThumbnail ?? false,
    embedChapters: stored.embedChapters ?? false,
    sponsorblockRemove: stored.sponsorblockRemove ?? false,
  };
}

export function normalizeImage(
  input: z.input<typeof StoredImageSettingsSchema>,
): ImageDownloadSettings {
  const stored = StoredImageSettingsSchema.catch({}).parse(input);
  return {
    maxLongEdge: snapToSet(stored.maxLongEdge, ALLOWED_LONG_EDGES, 2048),
    format: stored.format ?? "original",
    quality: clampQuality(stored.quality),
    lossless: stored.lossless ?? false,
    progressive: stored.progressive ?? false,
    preserveMetadata: stored.preserveMetadata ?? false,
    maxFileSizeMb: clampFilesize(stored.maxFileSizeMb, 1_000),
    splitPosts: stored.splitPosts ?? false,
  };
}

function clampQuality(q: number | null | undefined): number {
  const n = Math.floor(Number(q));
  if (!Number.isFinite(n)) return 80;
  return Math.min(100, Math.max(1, n));
}

function clampFilesize(
  mb: number | null | undefined,
  ceiling: number,
): number | null {
  if (mb === null || mb === undefined) return null;
  const n = Math.floor(Number(mb));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, ceiling);
}

const StoredSourcesSchema = z
  .object({ sources: z.record(z.string(), z.unknown()).optional() })
  .catch({});

const EXTERNAL_SOURCES: ReadonlySet<string> = new Set(EXTERNAL_SOURCE_IDS);

function sourceOverrides<T>(
  stored: { sources?: SourceOverrides<T> } | null | undefined,
  schema: z.ZodType<Partial<T>>,
): SourceOverrides<T> {
  const sources = StoredSourcesSchema.parse(stored).sources;
  const out: SourceOverrides<T> = {};
  if (!sources) return out;
  for (const source of EXTERNAL_SOURCE_IDS) {
    if (!(source in sources)) continue;
    const parsed = schema.parse(sources[source] ?? {});
    /** SAFETY: entries come from `parsed`, a Partial<T>, with only undefined values dropped. */
    out[source] = Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value !== undefined),
    ) as Partial<T>;
  }
  return out;
}

export function videoSourceOverrides(
  stored: StoredVideoDownload | null | undefined,
): SourceOverrides<VideoDownloadSettings> {
  return sourceOverrides(stored, StoredVideoSettingsSchema.catch({}));
}

export function imageSourceOverrides(
  stored: StoredImageDownload | null | undefined,
): SourceOverrides<ImageDownloadSettings> {
  return sourceOverrides(stored, StoredImageSettingsSchema.catch({}));
}

function isExternal(
  source: Source | null | undefined,
): source is ExternalSource {
  return source != null && EXTERNAL_SOURCES.has(source);
}

export function resolveVideo(
  global: VideoDownloadSettings,
  overrides: SourceOverrides<VideoDownloadSettings>,
  source: Source | null | undefined,
): VideoDownloadSettings {
  const override = isExternal(source) ? overrides[source] : undefined;
  return override ? normalizeVideo({ ...global, ...override }) : global;
}

export function resolveImage(
  global: ImageDownloadSettings,
  overrides: SourceOverrides<ImageDownloadSettings>,
  source: Source | null | undefined,
): ImageDownloadSettings {
  const override = isExternal(source) ? overrides[source] : undefined;
  return override ? normalizeImage({ ...global, ...override }) : global;
}
