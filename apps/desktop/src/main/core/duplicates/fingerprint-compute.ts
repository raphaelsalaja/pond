import sharp from "sharp";
import { decodeAudioSamples } from "../../lib/ffmpeg-audio";
import { probeMediaDuration, sampleGrayFrames } from "../../lib/ffmpeg-frame";
import {
  AUDIO_PRINT_MAX_SECONDS,
  AUDIO_PRINT_SAMPLE_RATE,
  audioPrintFromSamples,
  encodeAudioPrint,
  isSilent,
} from "../../lib/fingerprint/audio-print";
import {
  DHASH_HEIGHT,
  DHASH_WIDTH,
  isLowDetailHash,
} from "../../lib/fingerprint/dhash";
import {
  encodeImagePrint,
  IMAGE_PRINT_DECODE_SIZE,
  imagePrintFromGray,
} from "../../lib/fingerprint/image-print";
import {
  detailedFrameCount,
  encodeVideoPrint,
  videoPrintFromFrames,
  videoSampleTimes,
} from "../../lib/fingerprint/video-print";
import { binariesAvailable } from "../refresh/binaries";
import { FFMPEG_UNAVAILABLE, FINGERPRINT_ALGORITHMS } from "./fingerprints";
import type { FingerprintAlgorithm, FingerprintStatus } from "./fingerprints";

export interface FingerprintOutcome {
  status: FingerprintStatus;
  value?: Uint8Array;
  error?: string;
}

const MIN_DETAILED_FRAMES = 5;
/** FFmpeg reports a file with no audio stream as a mapping error; that file will never have a print. */
const NO_AUDIO_STREAM =
  /does not contain any stream|matches no streams|Output file is empty/i;

export async function imageFingerprint(
  source: string | Buffer,
): Promise<FingerprintOutcome> {
  const pixels = await sharp(source, { pages: 1 })
    .rotate()
    .resize(IMAGE_PRINT_DECODE_SIZE, IMAGE_PRINT_DECODE_SIZE, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const print = imagePrintFromGray({
    pixels,
    width: IMAGE_PRINT_DECODE_SIZE,
    height: IMAGE_PRINT_DECODE_SIZE,
  });
  if (isLowDetailHash(print.full)) {
    return { status: "low-detail" };
  }
  return { status: "ok", value: encodeImagePrint(print) };
}

async function videoFingerprint(path: string): Promise<FingerprintOutcome> {
  const duration = await probeMediaDuration(path);
  if (!duration) {
    return { status: "failed", error: "No readable duration" };
  }
  const plan = videoSampleTimes(duration);
  const frames = await sampleGrayFrames(path, {
    windowSeconds: plan.windowSeconds,
    count: plan.count,
    width: DHASH_WIDTH,
    height: DHASH_HEIGHT,
  });
  if (!frames?.length) {
    return { status: "failed", error: "No frames decoded" };
  }
  const print = videoPrintFromFrames(
    duration,
    plan.windowSeconds / frames.length,
    frames,
  );
  if (detailedFrameCount(print) < MIN_DETAILED_FRAMES) {
    return { status: "low-detail" };
  }
  return { status: "ok", value: encodeVideoPrint(print) };
}

async function audioFingerprint(path: string): Promise<FingerprintOutcome> {
  const duration = await probeMediaDuration(path);
  if (!duration) {
    return { status: "failed", error: "No readable duration" };
  }
  let samples: Float32Array;
  try {
    ({ audio: samples } = await decodeAudioSamples(
      path,
      AUDIO_PRINT_SAMPLE_RATE * AUDIO_PRINT_MAX_SECONDS,
      0,
      AUDIO_PRINT_SAMPLE_RATE,
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (NO_AUDIO_STREAM.test(message)) {
      return { status: "unsupported", error: "No audio track" };
    }
    throw error;
  }
  if (samples.length === 0) {
    return { status: "unsupported", error: "No audio track" };
  }
  if (isSilent(samples)) {
    return { status: "low-detail" };
  }
  const print = audioPrintFromSamples(samples, duration);
  if (print.frames.length === 0) {
    return { status: "low-detail" };
  }
  return { status: "ok", value: encodeAudioPrint(print) };
}

export async function computeFingerprint(
  algorithm: FingerprintAlgorithm,
  path: string,
): Promise<FingerprintOutcome> {
  if (algorithm.needsFfmpeg && !binariesAvailable().ffmpeg) {
    return { status: "unsupported", error: FFMPEG_UNAVAILABLE };
  }
  switch (algorithm.algorithm) {
    case FINGERPRINT_ALGORITHMS.image.algorithm:
      return imageFingerprint(path);
    case FINGERPRINT_ALGORITHMS.video.algorithm:
      return videoFingerprint(path);
    case FINGERPRINT_ALGORITHMS.audio.algorithm:
      return audioFingerprint(path);
    default:
      return { status: "unsupported", error: "Unknown algorithm" };
  }
}
