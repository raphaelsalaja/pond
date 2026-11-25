import { z } from "zod";

const ViewerActionSchema = z.enum([
  "none",
  "open",
  "preview",
  "quick-look",
  "presentation",
  "detached",
]);

/** The renderer may have no `process`, and Node may have no `navigator`. */
interface HostGlobal {
  navigator?: { platform?: string };
  process?: { platform?: string };
}

const host: HostGlobal = globalThis;

/** Space defaults to native Quick Look on macOS; other platforms only have the in-app preview. */
const IS_DARWIN =
  host.process?.platform === "darwin" ||
  /Mac/.test(host.navigator?.platform ?? "");

export const ViewerPrefsSchema = z.object({
  spaceBehavior: z.enum(["toggle", "hold"]).catch("toggle"),
  spaceAction: ViewerActionSchema.catch(IS_DARWIN ? "quick-look" : "preview"),
  doubleClickAction: ViewerActionSchema.catch("open"),
  middleClickAction: ViewerActionSchema.catch("open"),
  /** The click that peeks at a Save in Quick Preview, whatever Space and double-click do. */
  peekClick: z
    .enum(["off", "option", "option-shift", "option-command"])
    .catch("option"),
  dragToFile: z.boolean().catch(true),
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
  /** Shared by every preview video. Volume stays on the element. */
  videoMuted: z.boolean().catch(false),
  videoWheelBehavior: z.enum(["none", "progress", "volume"]).catch("progress"),
  videoSeekSeconds: z
    .union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)])
    .catch(10),
});
