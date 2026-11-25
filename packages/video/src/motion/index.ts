/** Easing and envelope helpers. Every frame is a pure function of `t` in milliseconds. */

export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

export const ease = {
  out: (p: number) => 1 - (1 - p) ** 3,
  outQuint: (p: number) => 1 - (1 - p) ** 5,
  in: (p: number) => p ** 3,
  inOut: (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  /** A gentle overshoot for things that land. */
  outBack: (p: number) => {
    const c = 1.4;
    return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
  },
};

export const progress = (t: number, start: number, duration: number) =>
  duration <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / duration);

export interface Envelope {
  opacity: number;
  dy: number;
  blur: number;
}

interface EnvelopeTiming {
  duration?: number;
  rise?: number;
  out?: number;
}

/** Fade, lift, and unblur in at `enter`; reverse at `exit`. */
export function envelope(
  t: number,
  enter: number,
  exit: number,
  { duration = 700, rise = 16, out = 350 }: EnvelopeTiming = {},
): Envelope {
  const a = ease.outQuint(progress(t, enter, duration));
  const b = ease.in(progress(t, exit, out));
  return {
    opacity: a * (1 - b),
    dy: (1 - a) * rise - b * rise * 0.6,
    blur: (1 - a) * 8 + b * 8,
  };
}

export function styled(e: Envelope, transform = "") {
  return {
    opacity: e.opacity,
    transform: `${transform} translateY(${e.dy}px)`.trim(),
    filter: e.blur > 0.05 ? `blur(${e.blur}px)` : undefined,
    visibility: e.opacity <= 0.002 ? ("hidden" as const) : undefined,
  };
}

/** A stable 0 to 1 value per index. */
export const scatter = (index: number) => {
  const x = Math.sin(index * 12.9898 + 78.233) * 43_758.5453;
  return x - Math.floor(x);
};

export type Key<T> = T & { at: number; move?: number };

/** Piecewise path through keyed points, easing into each over `move` ms so it arrives at `at`. */
export function keyed<T extends Record<keyof T, number>>(
  t: number,
  keys: ReadonlyArray<Key<T>>,
): T {
  const [first] = keys;
  if (!first) {
    throw new Error("keyed: no keys");
  }
  const value = new Map<string, number>();
  for (const key of keys) {
    const move = key.move ?? 600;
    const k = ease.inOut(progress(t, key.at - move, move));
    for (const [name, target] of Object.entries<number | undefined>(key)) {
      if (name === "at" || name === "move" || target === undefined) continue;
      value.set(name, mix(value.get(name) ?? target, target, k));
    }
  }
  /** Every field of `T` is a number present on the first key, so its shape carries `T` once `at` and `move` are dropped. */
  const result: T = { ...first, ...Object.fromEntries(value) };
  Reflect.deleteProperty(result, "at");
  Reflect.deleteProperty(result, "move");
  return result;
}
