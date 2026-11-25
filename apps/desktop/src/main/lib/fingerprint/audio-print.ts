import { popcount32 } from "./bits";
import { fft } from "./fft";
import { durationsClose } from "./video-print";

export const AUDIO_PRINT_ALGORITHM = "audio-print";
export const AUDIO_PRINT_VERSION = 1;
export const AUDIO_PRINT_SAMPLE_RATE = 5512;
export const AUDIO_PRINT_MAX_SECONDS = 120;

const FRAME_SIZE = 2048;
const HOP = 128;
const BANDS = 33;
const LOW_HZ = 300;
const HIGH_HZ = 2000;
const HEADER_BYTES = 20;
const SILENCE_RMS = 1e-4;
const MAX_OFFSET_SECONDS = 2;
const MIN_OVERLAP_FRAMES = 256;
const NEAR_BIT_ERROR_RATE = 0.3;

export interface AudioPrint {
  durationSeconds: number;
  hopSeconds: number;
  frames: Uint32Array;
}

let bandEdges: Uint32Array | null = null;
let window: Float64Array | null = null;

function edges(): Uint32Array {
  if (bandEdges) return bandEdges;
  bandEdges = new Uint32Array(BANDS + 1);
  for (let band = 0; band <= BANDS; band++) {
    const hz = LOW_HZ * (HIGH_HZ / LOW_HZ) ** (band / BANDS);
    bandEdges[band] = Math.round((hz * FRAME_SIZE) / AUDIO_PRINT_SAMPLE_RATE);
  }
  return bandEdges;
}

function hann(): Float64Array {
  if (window) return window;
  window = new Float64Array(FRAME_SIZE);
  for (let index = 0; index < FRAME_SIZE; index++) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / FRAME_SIZE);
  }
  return window;
}

export function isSilent(samples: Float32Array): boolean {
  if (samples.length === 0) return true;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length) < SILENCE_RMS;
}

/** Haitsma–Kalker sub-fingerprints: each bit is the sign of the band-energy difference across neighbouring bands and frames. */
export function audioPrintFromSamples(
  samples: Float32Array,
  durationSeconds: number,
): AudioPrint {
  const bandIndex = edges();
  const taper = hann();
  const real = new Float64Array(FRAME_SIZE);
  const imag = new Float64Array(FRAME_SIZE);
  const frameCount = Math.max(
    0,
    Math.floor((samples.length - FRAME_SIZE) / HOP) + 1,
  );
  const frames = new Uint32Array(Math.max(0, frameCount - 1));
  let previous: Float64Array | null = null;
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * HOP;
    for (let index = 0; index < FRAME_SIZE; index++) {
      real[index] = (samples[start + index] ?? 0) * (taper[index] ?? 0);
      imag[index] = 0;
    }
    fft(real, imag);
    const energy = new Float64Array(BANDS);
    for (let band = 0; band < BANDS; band++) {
      let sum = 0;
      const to = Math.max((bandIndex[band] ?? 0) + 1, bandIndex[band + 1] ?? 0);
      for (let bin = bandIndex[band] ?? 0; bin < to; bin++) {
        const r = real[bin] ?? 0;
        const i = imag[bin] ?? 0;
        sum += r * r + i * i;
      }
      energy[band] = sum;
    }
    if (previous) {
      let bits = 0;
      for (let band = 0; band < BANDS - 1; band++) {
        const now = (energy[band] ?? 0) - (energy[band + 1] ?? 0);
        const before = (previous[band] ?? 0) - (previous[band + 1] ?? 0);
        if (now - before > 0) bits |= 1 << (31 - band);
      }
      frames[frame - 1] = bits >>> 0;
    }
    previous = energy;
  }
  return {
    durationSeconds,
    hopSeconds: HOP / AUDIO_PRINT_SAMPLE_RATE,
    frames,
  };
}

export function encodeAudioPrint(print: AudioPrint): Uint8Array {
  const bytes = new Uint8Array(HEADER_BYTES + print.frames.length * 4);
  const view = new DataView(bytes.buffer);
  view.setFloat64(0, print.durationSeconds);
  view.setFloat64(8, print.hopSeconds);
  view.setUint32(16, print.frames.length);
  for (const [index, frame] of print.frames.entries()) {
    view.setUint32(HEADER_BYTES + index * 4, frame);
  }
  return bytes;
}

export function decodeAudioPrint(bytes: Uint8Array): AudioPrint | null {
  if (bytes.byteLength < HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(16);
  if (bytes.byteLength !== HEADER_BYTES + count * 4) return null;
  const frames = new Uint32Array(count);
  for (let index = 0; index < count; index++) {
    frames[index] = view.getUint32(HEADER_BYTES + index * 4);
  }
  const durationSeconds = view.getFloat64(0);
  const hopSeconds = view.getFloat64(8);
  if (!(durationSeconds > 0) || !(hopSeconds > 0)) return null;
  return { durationSeconds, hopSeconds, frames };
}

export interface AudioMatch {
  bitErrorRate: number;
  offsetSeconds: number;
}

/** Slides one print over the other within a couple of seconds and keeps the lowest bit error rate. */
export function compareAudioPrints(
  left: AudioPrint,
  right: AudioPrint,
): AudioMatch | null {
  if (!durationsClose(left.durationSeconds, right.durationSeconds)) return null;
  if (left.hopSeconds !== right.hopSeconds) return null;
  const maxShift = Math.round(MAX_OFFSET_SECONDS / left.hopSeconds);
  let best: AudioMatch | null = null;
  for (let shift = -maxShift; shift <= maxShift; shift++) {
    const from = Math.max(0, -shift);
    const to = Math.min(left.frames.length, right.frames.length - shift);
    const overlap = to - from;
    if (overlap < MIN_OVERLAP_FRAMES) continue;
    let errors = 0;
    for (let index = from; index < to; index++) {
      errors += popcount32(
        ((left.frames[index] ?? 0) ^ (right.frames[index + shift] ?? 0)) | 0,
      );
    }
    const bitErrorRate = errors / (overlap * 32);
    if (!best || bitErrorRate < best.bitErrorRate) {
      best = { bitErrorRate, offsetSeconds: shift * left.hopSeconds };
    }
  }
  if (!best || best.bitErrorRate > NEAR_BIT_ERROR_RATE) return null;
  return best;
}
