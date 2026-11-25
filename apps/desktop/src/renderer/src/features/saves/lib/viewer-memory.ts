import { z } from "zod";

const poseSchema = z.object({
  zoom: z.number().min(0.05).max(32),
  x: z.number().finite(),
  y: z.number().finite(),
});
export type ImagePose = z.infer<typeof poseSchema>;
export const FIT_POSE: ImagePose = { zoom: 1, x: 0, y: 0 };
const entrySchema = z.object({
  image: poseSchema.optional(),
  playback: z.number().finite().nonnegative().optional(),
  loop: z
    .tuple([z.number().nonnegative(), z.number().nonnegative()])
    .nullable()
    .optional(),
});
type ViewerMemory = z.infer<typeof entrySchema>;
const storageKey = "pond:viewer-memory";
const entries = new Map<string, ViewerMemory>();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = z
      .array(z.tuple([z.string(), entrySchema]))
      .safeParse(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"));
    if (parsed.success) {
      for (const [key, value] of parsed.data.slice(-200)) {
        entries.set(key, value);
      }
    }
  } catch {
    /** Unreadable stored memory starts empty; the next write replaces it. */
  }
}

function set(key: string, patch: ViewerMemory) {
  load();
  const previous = entries.get(key);
  entries.delete(key);
  entries.set(key, { ...previous, ...patch });
  while (entries.size > 200) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...entries]));
  } catch {
    /** Storage can be full or blocked; the memory still applies for this session. */
  }
}

export const viewerMemory = {
  hasImage(key: string): boolean {
    load();
    return entries.get(key)?.image !== undefined;
  },
  image(key: string): ImagePose {
    load();
    return entries.get(key)?.image ?? FIT_POSE;
  },
  setImage(key: string, pose: ImagePose): void {
    set(key, { image: pose });
  },
  playback(key: string): number {
    load();
    return entries.get(key)?.playback ?? 0;
  },
  loop(key: string): [number, number] | null {
    load();
    return entries.get(key)?.loop ?? null;
  },
  setLoop(key: string, range: [number, number] | null): void {
    set(key, { loop: range });
  },
  setPlayback(key: string, seconds: number): void {
    if (Number.isFinite(seconds) && seconds >= 0) {
      set(key, { playback: seconds });
    }
  },
};

export function zoomImageAt(
  pose: ImagePose,
  zoom: number,
  point: { x: number; y: number },
): ImagePose {
  const next = Math.min(32, Math.max(0.05, zoom));
  const scale = next / pose.zoom;
  return {
    zoom: next,
    x: point.x - (point.x - pose.x) * scale,
    y: point.y - (point.y - pose.y) * scale,
  };
}

export type ViewerWheelBehavior = "scroll" | "zoom" | "navigate";
export type ViewerWheelIntent = "zoom" | "pan" | "navigate";

export function viewerWheelIntent(event: {
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  wheelBehavior: ViewerWheelBehavior;
}): ViewerWheelIntent {
  if (event.ctrlKey || event.altKey || event.metaKey) return "zoom";
  if (event.wheelBehavior === "zoom") return "zoom";
  if (event.wheelBehavior === "navigate") return "navigate";
  return "pan";
}

const PINCH_GAIN = 0.01;
const WHEEL_GAIN = 0.002;
const LINE_HEIGHT = 16;
const PAGE_HEIGHT = 800;

/** Chromium pinch wheel events are small pixel deltas; mouse notches are much larger. */
export function wheelZoomFactor(
  deltaY: number,
  deltaMode: number,
  pinch: boolean,
): number {
  const pixels =
    deltaMode === 1
      ? deltaY * LINE_HEIGHT
      : deltaMode === 2
        ? deltaY * PAGE_HEIGHT
        : deltaY;
  return Math.exp(-pixels * (pinch ? PINCH_GAIN : WHEEL_GAIN));
}

const ZOOM_SLIDER_MAX = 100;
const ZOOM_SLIDER_MID = 50;
const ACTUAL_AT_MIN = 0.05;
const ACTUAL_AT_MAX = 8;

export function poseToActual(zoom: number, oneToOne: number | null): number {
  return oneToOne && oneToOne > 0 ? zoom / oneToOne : zoom;
}

export function sliderToActual(slider: number): number {
  const t = Math.min(ZOOM_SLIDER_MAX, Math.max(0, slider));
  if (t <= ZOOM_SLIDER_MID) {
    const u = t / ZOOM_SLIDER_MID;
    return ACTUAL_AT_MIN * (1 / ACTUAL_AT_MIN) ** u;
  }
  const u = (t - ZOOM_SLIDER_MID) / ZOOM_SLIDER_MID;
  return 1 * ACTUAL_AT_MAX ** u;
}

export function actualToSlider(actual: number): number {
  const value = Math.min(ACTUAL_AT_MAX, Math.max(ACTUAL_AT_MIN, actual));
  if (value <= 1) {
    return (
      ZOOM_SLIDER_MID *
      (Math.log(value / ACTUAL_AT_MIN) / Math.log(1 / ACTUAL_AT_MIN))
    );
  }
  return (
    ZOOM_SLIDER_MID +
    ZOOM_SLIDER_MID * (Math.log(value) / Math.log(ACTUAL_AT_MAX))
  );
}
