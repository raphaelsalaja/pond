import { definePatch } from "@web-kits/audio";
import type {
  Layer,
  PlayOptions,
  ReverbEffect,
  SoundDefinition,
} from "@web-kits/audio";
import { SOUND_SAMPLES } from "./samples.gen";
import type { SoundSample } from "./samples.gen";

export const UI_SOUND_NAMES = [
  "tap",
  "soft",
  "toggleOn",
  "toggleOff",
  "success",
  "trash",
] as const;

export type UiSoundName = (typeof UI_SOUND_NAMES)[number];

type SoundVariants = Record<UiSoundName, ReadonlyArray<SoundDefinition>>;

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

/** The library fetches sample URLs, and the desktop CSP allows blob: for fetch where it does not allow data:. */
function sampleUrl(sample: SoundSample): string {
  const bytes = Uint8Array.from(atob(sample.wav), (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

/** A recorded contact at full level for its length; without an envelope the library fades it from the first sample. */
function recording(sample: SoundSample, gain: number): Layer {
  return {
    source: { type: "sample", url: sampleUrl(sample) },
    envelope: { attack: 0, decay: sample.seconds, sustain: 1, release: 0.005 },
    gain,
  };
}

/** Small, damped room; macOS cues are nearly dry, so frequent ones only get a trace. */
function room(mix: number, decay = 0.4): ReverbEffect {
  return { type: "reverb", decay, damping: 0.5, preDelay: 0.01, mix };
}

/** One patch sound per recording, so a cue can alternate between takes of the same contact. */
function recorded(
  samples: ReadonlyArray<SoundSample>,
  gain: number,
): Array<SoundDefinition> {
  return samples.map((sample) => ({ layers: [recording(sample, gain)] }));
}

/**
 * Clicks and toggles are recordings from Kenney's UI Audio pack (CC0), prepared by scripts/generate-sound-samples.mjs;
 * success and trash are modeled on measurements of macOS system cues, not sampled from them.
 * @see https://kenney.nl/assets/ui-audio
 */
export const UI_SOUND_VARIANTS = {
  tap: recorded(SOUND_SAMPLES.tap, 0.375),
  soft: recorded(SOUND_SAMPLES.soft, 0.15),
  toggleOn: recorded(SOUND_SAMPLES.toggleOn, 0.23),
  toggleOff: recorded(SOUND_SAMPLES.toggleOff, 0.2),
  success: [
    {
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
  ],
  trash: [
    {
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
  ],
} satisfies SoundVariants;

/** The first take keeps the cue's own name, so `SOUND_PATCH.play("tap")` still plays a tap. */
function variantKey(name: UiSoundName, index: number): string {
  return index === 0 ? name : `${name}.${index + 1}`;
}

export const SOUND_PATCH = definePatch({
  name: "pond",
  author: "pond",
  description: "Recorded interface clicks with warm macOS-style confirmations",
  sounds: Object.fromEntries(
    UI_SOUND_NAMES.flatMap((name) =>
      UI_SOUND_VARIANTS[name].map((sound, index) => [
        variantKey(name, index),
        sound,
      ]),
    ),
  ),
});

/** Recordings drift in pitch and level like a real switch; tonal cues stay close so their chords stay in tune. */
const JITTER: Record<UiSoundName, { detune: number; volume: number }> = {
  tap: { detune: 45, volume: 0.12 },
  soft: { detune: 45, volume: 0.12 },
  toggleOn: { detune: 35, volume: 0.1 },
  toggleOff: { detune: 35, volume: 0.1 },
  success: { detune: 8, volume: 0.05 },
  trash: { detune: 20, volume: 0.08 },
};

export interface UiSoundPlayerOptions {
  play: (key: string, opts: PlayOptions) => void;
  /** Returns a number in [0, 1), like `Math.random`. */
  random?: () => number;
}

export type PlayUiSound = (
  name: UiSoundName,
  opts?: { volume?: number },
) => void;

/** Never repeats the take a cue just played, so rapid clicks don't machine-gun one recording. */
export function createUiSoundPlayer({
  play,
  random = Math.random,
}: UiSoundPlayerOptions): PlayUiSound {
  const lastTake = new Map<UiSoundName, number>();
  return (name, opts) => {
    const count = UI_SOUND_VARIANTS[name].length;
    const previous = lastTake.get(name);
    const index =
      previous === undefined
        ? Math.floor(random() * count)
        : (previous + 1 + Math.floor(random() * (count - 1))) % count;
    lastTake.set(name, index);
    play(variantKey(name, index), {
      volume: opts?.volume,
      jitter: JITTER[name],
    });
  };
}

/** Plays a cue on the shared audio context; callers make sure the context is ready first. */
export const playUiSound = createUiSoundPlayer({
  play: (key, opts) => SOUND_PATCH.play(key, opts),
});
