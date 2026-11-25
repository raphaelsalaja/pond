import type { Layer, SoundDefinition } from "@web-kits/audio";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SOUND_PATCH, UI_SOUND_NAMES } from ".";

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

const BUDGETS: Record<
  (typeof UI_SOUND_NAMES)[number],
  { toneGain: number; longestMs: number }
> = {
  tap: { toneGain: 0.2, longestMs: 100 },
  soft: { toneGain: 0.2, longestMs: 100 },
  toggleOn: { toneGain: 0.6, longestMs: 200 },
  toggleOff: { toneGain: 0.6, longestMs: 200 },
  success: { toneGain: 0.6, longestMs: 800 },
  trash: { toneGain: 0.6, longestMs: 500 },
};

describe("interface sounds", () => {
  const patch = SOUND_PATCH.toJSON();
  const tone = (name: (typeof UI_SOUND_NAMES)[number]) =>
    gainOf(patch.sounds?.[name], false);
  const noise = (name: (typeof UI_SOUND_NAMES)[number]) =>
    gainOf(patch.sounds?.[name], true);

  it("exposes every production cue", () => {
    expect(patch.sounds).toBeDefined();
    expect(Object.keys(patch.sounds ?? {})).toEqual([...UI_SOUND_NAMES]);
  });

  it.each(UI_SOUND_NAMES)(
    "keeps %s envelopes, gain, and frequencies in UI bounds",
    (name) => {
      const sound = patch.sounds?.[name];
      const layers = layersOf(sound);
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
      expect(gainOf(sound, false)).toBeLessThanOrEqual(budget.toneGain);
      expect(Math.max(...layers.map(durationMs))).toBeLessThanOrEqual(
        budget.longestMs,
      );
    },
  );

  it("keeps frequent cues quieter than rare ones", () => {
    expect(tone("tap")).toBeLessThan(tone("success"));
    expect(tone("soft")).toBeLessThan(tone("tap"));
    expect(noise("soft")).toBeLessThan(noise("tap"));
    expect(tone("toggleOn")).toBeLessThan(tone("success"));
  });

  it("starts click cues on a contact transient", () => {
    for (const name of ["tap", "soft", "toggleOn", "toggleOff"] as const) {
      const [first] = layersOf(patch.sounds?.[name]);
      expect(first && isNoise(first)).toBe(true);
      expect(first?.envelope?.attack ?? 0).toBe(0);
      expect(first?.envelope?.decay ?? 1).toBeLessThanOrEqual(0.002);
    }
  });
});
