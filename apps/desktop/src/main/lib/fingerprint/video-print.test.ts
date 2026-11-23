import { describe, expect, it } from "vitest";
import {
  compareVideoPrints,
  decodeVideoPrint,
  durationsClose,
  encodeVideoPrint,
  type VideoPrint,
  videoSampleTimes,
} from "./video-print";

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

/** Random 64-bit hashes carry about half their bits, so none of them reads as a low-detail frame. */
function scene(seed: number, length: number): bigint[] {
  const next = random(seed);
  const frames: bigint[] = [];
  for (let index = 0; index < length; index++)
    frames.push((BigInt(next()) << 32n) | BigInt(next()));
  return frames;
}

function video(
  frames: bigint[],
  intervalSeconds = 1,
  durationSeconds = frames.length * intervalSeconds,
): VideoPrint {
  return { durationSeconds, intervalSeconds, frames };
}

const noise = (hash: bigint, index: number) =>
  hash ^ (1n << BigInt(index % 64)) ^ (1n << BigInt((index * 7 + 3) % 64));

describe("video sampling plan", () => {
  it("samples about once a second within the window", () => {
    expect(videoSampleTimes(30)).toEqual({
      windowSeconds: 30,
      count: 30,
      intervalSeconds: 1,
    });
    const long = videoSampleTimes(7200);
    expect(long.windowSeconds).toBe(600);
    expect(long.count).toBe(180);
    expect(long.intervalSeconds).toBeCloseTo(600 / 180);
    expect(videoSampleTimes(0.4).count).toBe(1);
  });
});

describe("video print encoding", () => {
  it("round-trips and rejects damaged values", () => {
    const print = video(scene(1, 12), 0.5);
    const bytes = encodeVideoPrint(print);
    expect(decodeVideoPrint(bytes)).toEqual(print);
    expect(decodeVideoPrint(bytes.slice(0, bytes.length - 1))).toBeNull();
    expect(decodeVideoPrint(encodeVideoPrint(video([], 1, 0)))).toBeNull();
  });
});

describe("video alignment", () => {
  it("allows a few frames of difference in length", () => {
    expect(durationsClose(60, 61.4)).toBe(true);
    expect(durationsClose(60, 63)).toBe(false);
    expect(durationsClose(600, 615)).toBe(true);
  });

  it("aligns copies sampled at different rates by timestamp", () => {
    const frames = scene(2, 30);
    const resampled = Array.from({ length: 60 }, (_, index) =>
      noise(frames[Math.floor(index / 2)] as bigint, index),
    );
    const match = compareVideoPrints(video(frames), video(resampled, 0.5, 30));
    expect(match).toMatchObject({ matchedFrames: 30, comparedFrames: 30 });
  });

  it("finds a copy with a leading black frame at its offset", () => {
    const frames = scene(3, 30);
    const match = compareVideoPrints(video(frames), video([0n, ...frames]));
    expect(match).toMatchObject({ offsetSeconds: 1, matchedFrames: 30 });
  });

  it("rejects different videos, flat videos and mismatched lengths", () => {
    const frames = scene(4, 30);
    expect(compareVideoPrints(video(frames), video(scene(5, 30)))).toBeNull();
    const flat = Array.from({ length: 30 }, () => 0n);
    expect(compareVideoPrints(video(flat), video(flat))).toBeNull();
    expect(compareVideoPrints(video(frames), video(frames, 1, 45))).toBeNull();
  });
});
