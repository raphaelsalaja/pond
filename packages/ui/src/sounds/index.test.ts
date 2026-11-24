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
  if (hertz.success) {
    values.push(hertz.data);
  } else if (sweep.success) {
    values.push(sweep.data.start, sweep.data.end);
  }
  const filters = [layer.filter ?? []].flat();
  for (const filter of filters) {
    if ("frequency" in filter) {
      values.push(filter.frequency);
    }
    const peak = "envelope" in filter ? filter.envelope?.peak : undefined;
    if (peak !== undefined) {
      values.push(peak);
    }
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

  it("keeps envelopes, gain, and frequencies in UI bounds", () => {
    for (const name of UI_SOUND_NAMES) {
      const layers = layersOf(patch.sounds?.[name]);
      expect(layers.length).toBeGreaterThan(0);
      expect(layers.length).toBeLessThanOrEqual(5);

      let longest = 0;
      for (const layer of layers) {
        expect(layer.envelope?.decay ?? 0).toBeGreaterThan(0);
        if ((layer.envelope?.sustain ?? 0) > 0) {
          expect(layer.envelope?.release ?? 0).toBeGreaterThan(0);
        }
        if (isNoise(layer)) {
          expect(layer.gain ?? 0.5).toBeLessThanOrEqual(0.5);
        }
        longest = Math.max(longest, durationMs(layer));
        for (const hz of frequencies(layer)) {
          expect(hz).toBeGreaterThanOrEqual(20);
          expect(hz).toBeLessThanOrEqual(8000);
        }
      }

      const sound = patch.sounds?.[name];
      expect(gainOf(sound, false)).toBeLessThanOrEqual(0.6);
      if (name === "tap" || name === "soft") {
        expect(gainOf(sound, false)).toBeLessThanOrEqual(0.2);
        expect(longest).toBeLessThanOrEqual(100);
      }
      if (name === "toggleOn" || name === "toggleOff") {
        expect(longest).toBeLessThanOrEqual(200);
      }
      if (name === "success") {
        expect(longest).toBeLessThanOrEqual(800);
      }
      if (name === "trash") {
        expect(longest).toBeLessThanOrEqual(500);
      }
    }
  });

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
