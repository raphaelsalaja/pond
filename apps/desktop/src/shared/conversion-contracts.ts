import { z } from "zod";

export const ConversionFormatSchema = z.enum([
  "jpeg",
  "png",
  "webp",
  "avif",
  "tiff",
  "jxl",
  "heic",
  "heif",
  "exr",
  "hdr",
  "tga",
  "bmp",
  "ico",
  "gif",
  "apng",
  "animated-webp",
  "mp4",
  "webm",
]);
export type ConversionFormat = z.infer<typeof ConversionFormatSchema>;

const WidthSchema = z.number().int().min(1).max(8192).nullable().default(null);
const HeightSchema = z.number().int().min(1).max(8192).nullable().default(null);
const QualitySchema = z.number().int().min(1).max(100).default(85);
const LosslessSchema = z.boolean().default(false);

const ImageEncodingOptionsSchema = z.object({
  quality: QualitySchema,
  lossless: LosslessSchema,
});

export const RasterCompositionOptionsSchema = ImageEncodingOptionsSchema.extend(
  {
    format: z.enum(["jpeg", "png", "webp"]).default("png"),
  },
);

export const ConversionPresetSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  format: ConversionFormatSchema,
  width: WidthSchema,
  height: HeightSchema,
  quality: QualitySchema,
  lossless: LosslessSchema,
  start: z.number().min(0).max(86400).default(0),
  duration: z.number().min(0.1).max(3600).default(5),
  fps: z.number().int().min(1).max(120).default(12),
});
export type ConversionPreset = z.infer<typeof ConversionPresetSchema>;

export const ConversionCapabilitySchema = z.object({
  format: ConversionFormatSchema,
  category: z.enum(["image", "animation", "video"]),
  adapter: z.enum(["sharp", "ffmpeg"]),
  extension: z.string().min(1),
  mimeType: z.string().min(1),
  available: z.boolean(),
  unavailableReason: z.string().nullable(),
  supportsLossless: z.boolean(),
});
export type ConversionCapability = z.infer<typeof ConversionCapabilitySchema>;

export const ConversionRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(10_000),
  fileIndex: z.number().int().min(0).default(0),
  preset: ConversionPresetSchema,
});

export const ImageCompressionRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(10_000),
  fileIndex: z.number().int().min(0).default(0),
  mode: z.enum(["lossless", "quality", "webp", "upscale", "remove-background"]),
  quality: z.number().int().min(1).max(100).default(85),
});
export type ImageCompressionRequest = z.infer<
  typeof ImageCompressionRequestSchema
>;

export const VideoCompressionQualitySchema = z.enum([
  "high",
  "balanced",
  "small",
]);
export type VideoCompressionQuality = z.infer<
  typeof VideoCompressionQualitySchema
>;
export const VideoCompressionRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(10_000),
  quality: VideoCompressionQualitySchema.default("balanced"),
});
export type VideoCompressionRequest = z.infer<
  typeof VideoCompressionRequestSchema
>;

export const ConversionJobSchema = z.object({
  id: z.string(),
  kind: z.enum(["export", "compression"]),
  status: z.enum(["running", "complete", "cancelled", "failed"]),
  completed: z.number(),
  total: z.number(),
  progress: z.number(),
  currentId: z.string().nullable(),
  directory: z.string(),
  outputs: z.array(z.string()),
  changed: z.number(),
  skipped: z.number(),
  /** Saves left unchanged because their videos could not be compressed. */
  failed: z.number(),
  bytesBefore: z.number(),
  bytesAfter: z.number(),
  error: z.string().nullable(),
});
export type ConversionJob = z.infer<typeof ConversionJobSchema>;
export interface ConversionQueryInputs {
  "conversion.capabilities": Record<string, never>;
  "conversion.presets": Record<string, never>;
  "conversion.savePreset": { preset: ConversionPreset };
  "conversion.deletePreset": { id: string };
  "conversion.start": z.infer<typeof ConversionRequestSchema>;
  "conversion.compress": z.infer<typeof ImageCompressionRequestSchema>;
  "conversion.compressVideos": z.infer<typeof VideoCompressionRequestSchema>;
  "conversion.status": { id: string };
  "conversion.cancel": { id: string };
}
export interface ConversionQueryResults {
  "conversion.capabilities": ConversionCapability[];
  "conversion.presets": ConversionPreset[];
  "conversion.savePreset": ConversionPreset;
  "conversion.deletePreset": { ok: true };
  "conversion.start": ConversionJob | null;
  "conversion.compress": ConversionJob;
  "conversion.compressVideos": ConversionJob;
  "conversion.status": ConversionJob | null;
  "conversion.cancel": ConversionJob | null;
}

export const ConversionApiRequestSchema = ConversionRequestSchema.extend({
  directory: z.string().min(1),
});
