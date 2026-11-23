import { hamming64 } from "./bits";
import {
  DHASH_HEIGHT,
  DHASH_WIDTH,
  dhashFromGray,
  isLowDetailHash,
} from "./dhash";

export const VIDEO_PRINT_ALGORITHM = "video-dhash-seq";
export const VIDEO_PRINT_VERSION = 1;
export const VIDEO_PRINT_MAX_FRAMES = 180;
/** Only the opening ten minutes are sampled, so a feature-length file costs the same as a clip. */
export const VIDEO_PRINT_WINDOW_SECONDS = 600;
export const VIDEO_FRAME_BYTES = DHASH_WIDTH * DHASH_HEIGHT;

const HEADER_BYTES = 20;
const FRAME_DISTANCE = 10;
const MIN_COMPARED_FRAMES = 5;
const NEAR_RATIO = 0.8;
const OFFSET_STEPS = 3;

export interface VideoPrint {
  durationSeconds: number;
  intervalSeconds: number;
  frames: bigint[];
}

export function videoSampleTimes(durationSeconds: number): {
  windowSeconds: number;
  count: number;
  intervalSeconds: number;
} {
  const windowSeconds = Math.min(durationSeconds, VIDEO_PRINT_WINDOW_SECONDS);
  const count = Math.max(
    1,
    Math.min(VIDEO_PRINT_MAX_FRAMES, Math.ceil(windowSeconds)),
  );
  return { windowSeconds, count, intervalSeconds: windowSeconds / count };
}

export function videoPrintFromFrames(
  durationSeconds: number,
  intervalSeconds: number,
  frames: readonly Uint8Array[],
): VideoPrint {
  return {
    durationSeconds,
    intervalSeconds,
    frames: frames.map((frame) => dhashFromGray(frame)),
  };
}

export function detailedFrameCount(print: VideoPrint): number {
  let count = 0;
  for (const frame of print.frames) if (!isLowDetailHash(frame)) count += 1;
  return count;
}

export function encodeVideoPrint(print: VideoPrint): Uint8Array {
  const bytes = new Uint8Array(HEADER_BYTES + print.frames.length * 8);
  const view = new DataView(bytes.buffer);
  view.setFloat64(0, print.durationSeconds);
  view.setFloat64(8, print.intervalSeconds);
  view.setUint32(16, print.frames.length);
  for (const [index, frame] of print.frames.entries())
    view.setBigUint64(HEADER_BYTES + index * 8, frame);
  return bytes;
}

export function decodeVideoPrint(bytes: Uint8Array): VideoPrint | null {
  if (bytes.byteLength < HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(16);
  if (bytes.byteLength !== HEADER_BYTES + count * 8) return null;
  const frames: bigint[] = [];
  for (let index = 0; index < count; index++)
    frames.push(view.getBigUint64(HEADER_BYTES + index * 8));
  const durationSeconds = view.getFloat64(0);
  const intervalSeconds = view.getFloat64(8);
  if (!(durationSeconds > 0) || !(intervalSeconds > 0)) return null;
  return { durationSeconds, intervalSeconds, frames };
}

/** Re-encodes and trims shift a file's length by a few frames, never by much more. */
export function durationsClose(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1.5, Math.max(left, right) * 0.03);
}

export interface VideoMatch {
  matchedFrames: number;
  comparedFrames: number;
  offsetSeconds: number;
}

/** Aligns by timestamp, not frame index, and tries a few whole-interval shifts for leading black frames or a trimmed intro. */
export function compareVideoPrints(
  left: VideoPrint,
  right: VideoPrint,
): VideoMatch | null {
  if (!durationsClose(left.durationSeconds, right.durationSeconds)) return null;
  let best: VideoMatch | null = null;
  for (let step = -OFFSET_STEPS; step <= OFFSET_STEPS; step++) {
    const offsetSeconds = step * left.intervalSeconds;
    let matchedFrames = 0;
    let comparedFrames = 0;
    for (let index = 0; index < left.frames.length; index++) {
      const time = (index + 0.5) * left.intervalSeconds + offsetSeconds;
      const other = Math.floor(time / right.intervalSeconds);
      if (other < 0 || other >= right.frames.length) continue;
      const a = left.frames[index] as bigint;
      const b = right.frames[other] as bigint;
      if (isLowDetailHash(a) || isLowDetailHash(b)) continue;
      comparedFrames += 1;
      if (hamming64(a, b) <= FRAME_DISTANCE) matchedFrames += 1;
    }
    if (comparedFrames < MIN_COMPARED_FRAMES) continue;
    if (
      !best ||
      matchedFrames / comparedFrames > best.matchedFrames / best.comparedFrames
    )
      best = { matchedFrames, comparedFrames, offsetSeconds };
  }
  if (!best || best.matchedFrames / best.comparedFrames < NEAR_RATIO)
    return null;
  return best;
}
