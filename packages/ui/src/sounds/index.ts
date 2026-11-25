import { definePatch } from "@web-kits/audio";
import type { Layer, ReverbEffect, SoundDefinition } from "@web-kits/audio";

export const UI_SOUND_NAMES = [
  "tap",
  "soft",
  "toggleOn",
  "toggleOff",
  "success",
  "trash",
] as const;

export type UiSoundName = (typeof UI_SOUND_NAMES)[number];

type SoundSet = Record<UiSoundName, SoundDefinition>;

type Hertz = number | { start: number; end: number };

interface ToneOptions {
  frequency: Hertz;
  gain: number;
  decay: number;
  delay?: number;
  attack?: number;
  release?: number;
}

function sine(opts: ToneOptions): Layer {
  return {
    source: { type: "sine", frequency: opts.frequency },
    envelope: {
      attack: opts.attack ?? 0.003,
      decay: opts.decay,
      sustain: 0,
      release: opts.release ?? 0.015,
    },
    delay: opts.delay,
    gain: opts.gain,
  };
}

interface SnapOptions {
  frequency: number;
  gain: number;
  decay: number;
  delay?: number;
}

/** A wide band of white noise reads as a physical contact without a pitch that tires on repeat. */
function snap(opts: SnapOptions): Layer {
  return {
    source: { type: "noise", color: "white" },
    filter: [
      { type: "bandpass", frequency: opts.frequency, resonance: 0.9 },
      { type: "lowpass", frequency: 7500 },
    ],
    envelope: { attack: 0, decay: opts.decay, sustain: 0, release: 0.002 },
    delay: opts.delay,
    gain: opts.gain,
  };
}

function tick(frequency: Hertz, gain: number, delay?: number): Layer {
  return sine({
    frequency,
    attack: 0.0003,
    decay: 0.0025,
    release: 0.003,
    delay,
    gain,
  });
}

/** One switch contact: the snap plus a tink on the inharmonic partial a small hard body rings at. */
function contact(pitch: number, level: number, delay?: number): Array<Layer> {
  return [
    snap({ frequency: pitch, decay: 0.0016, gain: 0.5 * level, delay }),
    tick(pitch * 1.62, 0.03 * level, delay),
  ];
}

const BODY = tick({ start: 900, end: 700 }, 0.03);

/** Small, damped room; macOS cues are nearly dry, so frequent ones only get a trace. */
function room(mix: number, decay = 0.4): ReverbEffect {
  return { type: "reverb", decay, damping: 0.5, preDelay: 0.01, mix };
}

/** Short and dark so contacts stay close-miked clicks instead of ringing tones. */
function booth(mix: number): ReverbEffect {
  return { type: "reverb", decay: 0.15, damping: 0.75, preDelay: 0.002, mix };
}

/**
 * Clicks and toggles follow earshot's designed click and toggle recipes; success and trash are modeled on
 * measurements of macOS system cues, not sampled from them.
 * @see https://github.com/Leonxlnx/earshot/tree/main/earshot/forge/recipes
 */
export const UI_SOUNDS = {
  tap: {
    layers: [
      ...contact(4200, 1),
      BODY,
      snap({ frequency: 4950, decay: 0.0012, gain: 0.175, delay: 0.009 }),
    ],
    effects: [booth(0.06)],
  },
  soft: {
    layers: [snap({ frequency: 2400, decay: 0.0014, gain: 0.3 }), BODY],
    effects: [booth(0.04)],
  },
  toggleOn: {
    layers: [...contact(3200, 1), BODY, ...contact(3900, 0.5, 0.04)],
    effects: [booth(0.08)],
  },
  toggleOff: {
    layers: [...contact(3600, 1), BODY, ...contact(2800, 0.5, 0.04)],
    effects: [booth(0.08)],
  },
  success: {
    layers: [
      sine({ frequency: 523.3, decay: 0.12, release: 0.04, gain: 0.07 }),
      sine({
        frequency: 784,
        decay: 0.3,
        release: 0.1,
        delay: 0.07,
        gain: 0.08,
      }),
      sine({
        frequency: 2352,
        decay: 0.1,
        release: 0.04,
        delay: 0.07,
        gain: 0.02,
      }),
    ],
    effects: [room(0.12, 0.7)],
  },
  trash: {
    layers: [
      {
        source: { type: "noise", color: "pink" },
        filter: {
          type: "bandpass",
          frequency: 1400,
          resonance: 0.8,
          envelope: { attack: 0.004, peak: 3600, decay: 0.12 },
        },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0, release: 0.03 },
        effects: [{ type: "tremolo", rate: 38, depth: 0.7 }],
        gain: 0.045,
      },
      sine({
        frequency: { start: 330, end: 200 },
        decay: 0.08,
        release: 0.03,
        delay: 0.07,
        gain: 0.06,
      }),
    ],
    effects: [room(0.08)],
  },
} satisfies SoundSet;

export const SOUND_PATCH = definePatch({
  name: "pond",
  author: "pond",
  description: "Tactile interface clicks with warm macOS-style confirmations",
  sounds: UI_SOUNDS,
});
