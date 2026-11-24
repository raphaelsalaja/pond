import { describe, expect, it } from "vitest";
import {
  AUDIO_PRINT_SAMPLE_RATE,
  audioPrintFromSamples,
  compareAudioPrints,
  decodeAudioPrint,
  encodeAudioPrint,
  isSilent,
} from "./audio-print";
import type { AudioPrint } from "./audio-print";
import { fft } from "./fft";

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

const SECONDS = 20;
const NOTE_SECONDS = 0.25;
const TONES = 33;

/** Every printed band holds a tone whose level changes each note, so each bit reflects signal rather than leakage. */
function melody(seed: number): Float32Array {
  const next = random(seed);
  const samples = new Float32Array(SECONDS * AUDIO_PRINT_SAMPLE_RATE);
  const noteLength = Math.round(NOTE_SECONDS * AUDIO_PRINT_SAMPLE_RATE);
  const frequencies = Array.from(
    { length: TONES },
    (_, tone) => 300 * (2000 / 300) ** ((tone + 0.5) / TONES),
  );
  const levels = new Float64Array(TONES);
  for (let index = 0; index < samples.length; index++) {
    if (index % noteLength === 0) {
      for (let tone = 0; tone < TONES; tone++) {
        levels[tone] = 0.006 + next() * 0.024;
      }
    }
    const t = index / AUDIO_PRINT_SAMPLE_RATE;
    const envelope = 1 - (index % noteLength) / noteLength / 2;
    let value = 0;
    for (let tone = 0; tone < TONES; tone++) {
      value +=
        (levels[tone] ?? 0) *
        Math.sin(2 * Math.PI * (frequencies[tone] ?? 0) * t);
    }
    samples[index] = envelope * value;
  }
  return samples;
}

function withNoise(samples: Float32Array, amount: number): Float32Array {
  const next = random(99);
  return samples.map((sample) => sample + (next() - 0.5) * 2 * amount);
}

function delayed(samples: Float32Array, silent: number): Float32Array {
  const out = new Float32Array(samples.length + silent);
  out.set(samples, silent);
  return out;
}

function printOf(samples: Float32Array): AudioPrint {
  return audioPrintFromSamples(
    samples,
    samples.length / AUDIO_PRINT_SAMPLE_RATE,
  );
}

describe("FFT", () => {
  it("transforms an impulse to a flat spectrum", () => {
    const real = new Float64Array(8);
    const imag = new Float64Array(8);
    real[0] = 1;
    fft(real, imag);
    expect([...real]).toEqual(Array.from({ length: 8 }, () => 1));
    expect([...imag].every((value) => Math.abs(value) < 1e-12)).toBe(true);
  });

  it("puts a pure tone in its bin", () => {
    const size = 64;
    const real = Float64Array.from({ length: size }, (_, index) =>
      Math.cos((2 * Math.PI * 5 * index) / size),
    );
    const imag = new Float64Array(size);
    fft(real, imag);
    const magnitude = (bin: number) =>
      Math.hypot(real[bin] ?? 0, imag[bin] ?? 0);
    expect(magnitude(5)).toBeCloseTo(size / 2);
    expect(magnitude(size - 5)).toBeCloseTo(size / 2);
    expect(magnitude(6)).toBeCloseTo(0);
  });

  it("rejects sizes that are not a power of two", () => {
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow();
  });
});

describe("audio print", () => {
  const original = melody(1);
  const print = printOf(original);

  it("round-trips its encoding", () => {
    expect(decodeAudioPrint(encodeAudioPrint(print))).toEqual(print);
    expect(decodeAudioPrint(new Uint8Array(4))).toBeNull();
  });

  it("matches a noisy copy", () => {
    const noisy = printOf(withNoise(original, 0.005));
    expect(compareAudioPrints(print, noisy)?.bitErrorRate).toBeLessThan(0.2);
  });

  it("finds a copy that starts later", () => {
    const silent = 22 * 128;
    const match = compareAudioPrints(print, printOf(delayed(original, silent)));
    expect(match?.offsetSeconds).toBeCloseTo(silent / AUDIO_PRINT_SAMPLE_RATE);
    expect(match?.bitErrorRate).toBe(0);
  });

  it("does not match a different recording", () => {
    expect(compareAudioPrints(print, printOf(melody(2)))).toBeNull();
  });

  it("tells silence apart from sound", () => {
    expect(isSilent(new Float32Array(1000))).toBe(true);
    expect(isSilent(new Float32Array(0))).toBe(true);
    expect(isSilent(original)).toBe(false);
  });
});
