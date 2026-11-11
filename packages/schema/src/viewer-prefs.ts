import { z } from "zod";

const ViewerActionSchema = z.enum([
  "none",
  "open",
  "preview",
  "quick-look",
  "presentation",
  "detached",
]);
export const ViewerPrefsSchema = z.object({
  spaceBehavior: z.enum(["toggle", "hold"]).catch("toggle"),
  spaceAction: ViewerActionSchema.catch("preview"),
  doubleClickAction: ViewerActionSchema.catch("open"),
  middleClickAction: ViewerActionSchema.catch("open"),
  wheelBehavior: z.enum(["scroll", "zoom", "navigate"]).catch("scroll"),
  defaultImageSize: z.enum(["fit", "actual"]).catch("fit"),
  rememberImagePosition: z.boolean().catch(true),
  imageRendering: z.enum(["smooth", "pixelated"]).catch("smooth"),
  transparentBackground: z
    .enum(["none", "checkerboard", "white", "black"])
    .catch("none"),
  thumbnailBackground: z
    .enum(["none", "black", "gray", "white", "grid"])
    .catch("none"),
  galleryFit: z.enum(["fit", "fill"]).catch("fit"),
  thumbnailBehavior: z.enum(["still", "scrub"]).catch("scrub"),
  thumbnailSpeed: z.enum(["slow", "normal", "fast"]).catch("normal"),
  thumbnailQuality: z.enum(["fast", "balanced", "quality"]).catch("balanced"),
  hoverZoom: z.boolean().catch(false),
  gifAutoplay: z.boolean().catch(true),
  autoplayVideo: z.boolean().catch(true),
  hoverVideo: z.boolean().catch(true),
  rememberPlayback: z.boolean().catch(true),
  loopShortVideos: z.boolean().catch(true),
  videoWheelBehavior: z.enum(["none", "progress", "volume"]).catch("progress"),
  videoSeekSeconds: z
    .union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)])
    .catch(10),
});
