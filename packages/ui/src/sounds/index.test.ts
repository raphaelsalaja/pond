import type { Layer, SoundDefinition } from "@web-kits/audio";
import type { PlayOptions } from "@web-kits/audio";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createUiSoundPlayer,
  SOUND_PATCH,
  UI_SOUND_NAMES,
  UI_SOUND_VARIANTS,
} from ".";
import { SOUND_SAMPLES } from "./samples.gen";

const HertzSchema = z.number();
const SweepSchema = z.object({ start: z.number(), end: z.number() });

function layersOf(sound: SoundDefinition | undefined): Array<Layer> {
  if (!sound) {
    return [];
  }
  return "layers" in sound ? sound.layers : [sound];
}

function frequencies(layer: Layer): Array<number> {
  const values: Array<number> = [];
  const source = layer.source;
  const freq = "frequency" in source ? source.frequency : undefined;
  const hertz = HertzSchema.safeParse(freq);
  const sweep = SweepSchema.safeParse(freq);
  if (hertz.success) values.push(hertz.data);
  else if (sweep.success) values.push(sweep.data.start, sweep.data.end);
  const filters = [layer.filter ?? []].flat();
  for (const filter of filters) {
    if ("frequency" in filter) values.push(filter.frequency);
    const peak = "envelope" in filter ? filter.envelope?.peak : undefined;
    if (peak !== undefined) values.push(peak);
  }
  return values;
}

function isNoise(layer: Layer): boolean {
  return layer.source.type === "noise";
}

/** Band-passed noise renders far quieter than a sine at the same gain, so each kind gets its own budget. */
function gainOf(sound: SoundDefinition | undefined, noise: boolean): number {
  return layersOf(sound)
    .filter((layer) => isNoise(layer) === noise)
    .reduce((sum, layer) => sum + (layer.gain ?? 0.5), 0);
}

function durationMs(layer: Layer): number {
  const env = layer.envelope;
  const attack = env?.attack ?? 0;
  const decay = env?.decay ?? 0;
  const release = env?.release ?? 0;
  const delay = layer.delay ?? 0;
  return (delay + attack + decay + release) * 1000;
}

function isSustained(layer: Layer): boolean {
  return (layer.envelope?.sustain ?? 0) > 0;
}

const RECORDED = ["tap", "soft", "toggleOn", "toggleOff"] as const;
const SYNTHESIZED = ["success", "trash"] as const;

const BUDGETS: Record<
  (typeof SYNTHESIZED)[number],
  { toneGain: number; longestMs: number }
> = {
  success: { toneGain: 0.6, longestMs: 800 },
  trash: { toneGain: 0.6, longestMs: 500 },
};

const RECORDED_BUDGETS: Record<
  (typeof RECORDED)[number],
  { gain: number; longestMs: number }
> = {
  tap: { gain: 0.4, longestMs: 60 },
  soft: { gain: 0.4, longestMs: 60 },
  toggleOn: { gain: 0.4, longestMs: 150 },
  toggleOff: { gain: 0.4, longestMs: 150 },
};

function isSample(layer: Layer): boolean {
  return layer.source.type === "sample";
}

function wavBytes(wav: string): Uint8Array {
  return Uint8Array.from(atob(wav), (char) => char.charCodeAt(0));
}

/** Mean level in dBFS of a 16-bit WAV's samples. */
function meanDb(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer);
  const frames = view.getUint32(40, true) / 2;
  let sum = 0;
  for (let i = 0; i < frames; i += 1) {
    const value = view.getInt16(44 + i * 2, true) / 32_768;
    sum += value * value;
  }
  return 10 * Math.log10(sum / frames);
}

/** Cycles through fixed draws so a test controls each pick. */
function sequence(values: ReadonlyArray<number>): () => number {
  let next = 0;
  return () => {
    const value = values[next % values.length] ?? 0;
    next += 1;
    return value;
  };
}

function recordPlays(random: () => number) {
  const plays: Array<{ key: string; opts: PlayOptions }> = [];
  const play = createUiSoundPlayer({
    play: (key, opts) => plays.push({ key, opts }),
    random,
  });
  return { play, plays };
}

describe("interface sounds", () => {
  const patch = SOUND_PATCH.toJSON();
  const sound = (key: string) => patch.sounds?.[key];

  it("exposes every production cue under its own name", () => {
    for (const name of UI_SOUND_NAMES) {
      expect(sound(name)).toEqual(UI_SOUND_VARIANTS[name][0]);
    }
  });

  it.each(RECORDED)("alternates %s between recordings", (name) => {
    expect(UI_SOUND_VARIANTS[name].length).toBeGreaterThan(1);
    expect(UI_SOUND_VARIANTS[name]).toHaveLength(SOUND_SAMPLES[name].length);
  });

  it.each(RECORDED)(
    "plays each %s take as one short recording at full length",
    (name) => {
      const budget = RECORDED_BUDGETS[name];
      for (const [index, take] of UI_SOUND_VARIANTS[name].entries()) {
        const layers = layersOf(take);
        expect(layers).toHaveLength(1);
        const [layer] = layers;
        expect(layer && isSample(layer)).toBe(true);
        expect(layer?.delay ?? 0).toBe(0);
        expect(layer?.envelope?.attack).toBe(0);
        expect(layer?.envelope?.sustain).toBe(1);
        expect(layer?.envelope?.decay).toBe(
          SOUND_SAMPLES[name][index]?.seconds,
        );
        expect(layer?.gain ?? 0.5).toBeLessThanOrEqual(budget.gain);
      }
      for (const sample of SOUND_SAMPLES[name]) {
        expect(sample.seconds * 1000).toBeLessThanOrEqual(budget.longestMs);
      }
    },
  );

  it("embeds each recording as a mono 16-bit WAV of its stated length", () => {
    for (const sample of RECORDED.flatMap((name) => SOUND_SAMPLES[name])) {
      const bytes = wavBytes(sample.wav);
      const view = new DataView(bytes.buffer);
      const text = String.fromCharCode(...bytes.subarray(0, 4));
      expect(text).toBe("RIFF");
      expect(view.getUint16(22, true)).toBe(1);
      expect(view.getUint16(34, true)).toBe(16);
      const rate = view.getUint32(24, true);
      expect(view.getUint32(40, true) / 2 / rate).toBeCloseTo(
        sample.seconds,
        3,
      );
    }
  });

  it.each(RECORDED)("keeps the %s takes within 2 dB of each other", (name) => {
    const levels = SOUND_SAMPLES[name].map((sample) =>
      meanDb(wavBytes(sample.wav)),
    );
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(2);
  });

  it("gives each toggle direction its own recordings", () => {
    const on = SOUND_SAMPLES.toggleOn.map((sample) => sample.wav);
    for (const sample of SOUND_SAMPLES.toggleOff) {
      expect(on).not.toContain(sample.wav);
    }
  });

  it.each(SYNTHESIZED)(
    "keeps %s envelopes, gain, and frequencies in UI bounds",
    (name) => {
      const layers = layersOf(sound(name));
      expect(layers.length).toBeGreaterThan(0);
      expect(layers.length).toBeLessThanOrEqual(5);

      for (const layer of layers) {
        expect(layer.envelope?.decay ?? 0).toBeGreaterThan(0);
        for (const hz of frequencies(layer)) {
          expect(hz).toBeGreaterThanOrEqual(20);
          expect(hz).toBeLessThanOrEqual(8000);
        }
      }
      for (const layer of layers.filter(isSustained)) {
        expect(layer.envelope?.release ?? 0).toBeGreaterThan(0);
      }
      for (const layer of layers.filter(isNoise)) {
        expect(layer.gain ?? 0.5).toBeLessThanOrEqual(0.5);
      }

      const budget = BUDGETS[name];
      expect(gainOf(sound(name), false)).toBeLessThanOrEqual(budget.toneGain);
      expect(Math.max(...layers.map(durationMs))).toBeLessThanOrEqual(
        budget.longestMs,
      );
    },
  );

  it("keeps the lighter click quieter than the main one", () => {
    const [soft] = layersOf(sound("soft"));
    const [tap] = layersOf(sound("tap"));
    expect(soft?.gain ?? 0.5).toBeLessThan(tap?.gain ?? 0.5);
  });
});

describe("playing interface sounds", () => {
  it("never plays the same take twice in a row", () => {
    const { play, plays } = recordPlays(sequence([0, 0, 0.99, 0.5, 0]));
    for (let i = 0; i < 5; i += 1) play("tap");
    const keys = plays.map((entry) => entry.key);
    for (let i = 1; i < keys.length; i += 1) {
      expect(keys[i]).not.toBe(keys[i - 1]);
    }
  });

  it("plays only keys the patch defines", () => {
    const patch = SOUND_PATCH.toJSON();
    const { play, plays } = recordPlays(sequence([0.1, 0.6, 0.9, 0.3]));
    for (const name of UI_SOUND_NAMES) {
      for (let i = 0; i < 4; i += 1) play(name);
    }
    for (const { key } of plays) {
      expect(patch.sounds?.[key]).toBeDefined();
    }
  });

  it("tracks the last take per cue", () => {
    const { play, plays } = recordPlays(sequence([0]));
    play("tap");
    play("soft");
    play("tap");
    expect(plays.map((entry) => entry.key)).toEqual(["tap", "soft", "tap.2"]);
  });

  it("passes volume through and jitters pitch and level", () => {
    const { play, plays } = recordPlays(sequence([0]));
    play("tap", { volume: 0.7 });
    play("success");
    const [tap, success] = plays;
    expect(tap?.opts.volume).toBe(0.7);
    expect(tap?.opts.jitter?.detune ?? 0).toBeGreaterThan(
      success?.opts.jitter?.detune ?? 0,
    );
    expect(tap?.opts.jitter?.volume ?? 0).toBeGreaterThan(0);
  });
});
