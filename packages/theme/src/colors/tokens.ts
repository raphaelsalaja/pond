/** Solves every `--ds-*` color token from a theme's background, foreground, accent, and contrast. */

export type Gamut = "srgb" | "p3";
export type ThemeMode = "light" | "dark";

export interface ThemeInput {
  background: string;
  foreground: string;
  accent: string;
  /** 0 to 100, where 50 is the default look. */
  contrast?: number;
}

export type ThemeTokenName = `--ds-${string}`;

export interface ThemeTokens {
  mode: ThemeMode;
  tokens: Record<ThemeTokenName, string>;
}

type Rgb = readonly [number, number, number];

interface Lab {
  l: number;
  a: number;
  b: number;
}

/** Chroma is relative to sRGB; `fit` widens it for the target gamut. */
interface Lch {
  l: number;
  c: number;
  h: number;
}

interface Ramp {
  hue: number;
  chroma: number;
  /** Step 9's lightness. Warm hues sit high and take dark text, since they turn muddy when darkened for white. */
  lightness: number;
}

/** The palette for colors you pick, in picker order. Red also seeds the danger role. */
const HUE_RAMPS = {
  red: { hue: 25, chroma: 0.2, lightness: 0.65 },
  orange: { hue: 50, chroma: 0.18, lightness: 0.73 },
  gold: { hue: 75, chroma: 0.15, lightness: 0.83 },
  yellow: { hue: 100, chroma: 0.16, lightness: 0.9 },
  lime: { hue: 128, chroma: 0.18, lightness: 0.87 },
  green: { hue: 150, chroma: 0.17, lightness: 0.72 },
  jade: { hue: 168, chroma: 0.14, lightness: 0.72 },
  teal: { hue: 185, chroma: 0.12, lightness: 0.72 },
  cyan: { hue: 210, chroma: 0.12, lightness: 0.75 },
  blue: { hue: 250, chroma: 0.15, lightness: 0.65 },
  indigo: { hue: 275, chroma: 0.17, lightness: 0.62 },
  violet: { hue: 292, chroma: 0.19, lightness: 0.62 },
  purple: { hue: 310, chroma: 0.21, lightness: 0.64 },
  magenta: { hue: 328, chroma: 0.22, lightness: 0.66 },
  pink: { hue: 350, chroma: 0.21, lightness: 0.66 },
} as const satisfies Record<string, Ramp>;

/** WCAG 2 ratio against gray-1 for gray steps 2 to 11 at contrast 50, matching the previous mix curves. */
const GRAY_TARGETS = {
  light: [1.07, 1.15, 1.26, 1.42, 1.7, 2.1, 2.79, 4.02, 6.36, 10.77],
  dark: [1.03, 1.08, 1.16, 1.3, 1.57, 2.03, 2.86, 4.31, 6.76, 10.75],
} as const satisfies Record<ThemeMode, readonly number[]>;

const TINT_CHROMA = [0.16, 0.32, 0.51, 0.69, 0.85, 0.95, 1, 1] as const;

/** Dark tints at full chroma read as neon on near-black backgrounds. */
const DARK_TINT_CHROMA = 0.6;

/** Share of the sRGB chroma edge a hue solid takes; the full edge reads as neon. */
const HUE_SOLID_CHROMA = 0.95;

const TEXT_MIN = 4.5;
const TEXT_STRONG_MIN = 7;

/** Largest lightness drop allowed so white text on the accent fill reaches 4.5:1. */
const MAX_FILL_SHIFT = 0.3;

/** Leonardo-style ratio multiplier per contrast level: 0 divides step distances by 1.6, 100 multiplies them. */
const CONTRAST_STRETCH = 1.6;

const FALLBACK: Omit<ThemeInput, "contrast"> = {
  background: "#ffffff",
  foreground: "#1b1b1b",
  accent: "#008fff",
};

const WHITE: Lch = { l: 1, c: 0, h: 0 };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function parseHex(input: string): Rgb | null {
  const raw = input.trim().replace(/^#/, "");
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const n = Number.parseInt(hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const toGamma = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** @see https://bottosson.github.io/posts/oklab/ */
function linearToLab([r, g, b]: Rgb): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function labToLinear({ l: L, a, b }: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Linear sRGB to linear Display P3, both D65. @see https://www.w3.org/TR/css-color-4/#color-conversion-code */
function linearToP3([r, g, b]: Rgb): Rgb {
  return [
    0.8224621209 * r + 0.1775378791 * g,
    0.0331941989 * r + 0.9668058011 * g,
    0.0170826307 * r + 0.0723974407 * g + 0.9105199286 * b,
  ];
}

const lchToLab = ({ l, c, h }: Lch): Lab => ({
  l,
  a: c * Math.cos((h * Math.PI) / 180),
  b: c * Math.sin((h * Math.PI) / 180),
});

function labToLch({ l, a, b }: Lab): Lch {
  const c = Math.hypot(a, b);
  return {
    l,
    c,
    h: c < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  };
}

const mixLab = (from: Lab, to: Lab, t: number): Lab => ({
  l: from.l + (to.l - from.l) * t,
  a: from.a + (to.a - from.a) * t,
  b: from.b + (to.b - from.b) * t,
});

const EPSILON = 1e-6;
const unit = (rgb: Rgb) => rgb.every((v) => v >= -EPSILON && v <= 1 + EPSILON);

function inGamut(linear: Rgb, gamut: Gamut): boolean {
  return unit(gamut === "srgb" ? linear : linearToP3(linear));
}

function cMax(l: number, h: number, gamut: Gamut): number {
  if (l <= 0 || l >= 1) return 0;
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(labToLinear(lchToLab({ l, c: mid, h })), gamut)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Keeps a color's position relative to the sRGB edge, so P3 widens it without leaving either gamut. */
function fit({ l, c, h }: Lch, gamut: Gamut): Lch {
  const lightness = clamp(l, 0, 1);
  if (c <= 0) return { l: lightness, c: 0, h };
  const srgbMax = cMax(lightness, h, "srgb");
  if (srgbMax <= 0) return { l: lightness, c: 0, h };
  const relative = Math.min(c / srgbMax, 1);
  const max = gamut === "srgb" ? srgbMax : cMax(lightness, h, gamut);
  return { l: lightness, c: relative * max, h };
}

function p3ToLinear([r, g, b]: Rgb): Rgb {
  return [
    1.2249401763 * r - 0.2249401763 * g,
    -0.0420569547 * r + 1.0420569547 * g,
    -0.0196375546 * r - 0.0786360456 * g + 1.0982736001 * b,
  ];
}

const P3_PLACES = 10_000;

/** Output rounds to 8-bit hex or 4-place P3, so contrast is measured on the rounded color that ships. */
function shown(linear: Rgb, gamut: Gamut): Rgb {
  if (gamut === "p3" && !unit(linear)) {
    const [r, g, b] = linearToP3(linear).map((v) =>
      toLinear(Math.round(clamp(toGamma(v), 0, 1) * P3_PLACES) / P3_PLACES),
    );
    return p3ToLinear([r ?? 0, g ?? 0, b ?? 0]);
  }
  const [r, g, b] = linear.map((v) =>
    toLinear(Math.round(clamp(toGamma(v), 0, 1) * 255) / 255),
  );
  return [r ?? 0, g ?? 0, b ?? 0];
}

const linearOf = (color: Lch, gamut: Gamut): Rgb =>
  shown(labToLinear(lchToLab(fit(color, gamut))), gamut);

/** WCAG 2 relative luminance; linear sRGB is valid for P3 colors because Y is linear. */
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function wcag(a: Rgb, b: Rgb): number {
  const la = Math.max(0, luminance(a));
  const lb = Math.max(0, luminance(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Smallest t in [0, 1] where `reaches` turns true; 1 when it never does. */
function bisect(reaches: (t: number) => boolean): number {
  if (!reaches(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (reaches(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

interface Context {
  gamut: Gamut;
  mode: ThemeMode;
  bg: Lab;
  bgLinear: Rgb;
  /** Lightness a tint moves toward as it gains contrast. */
  toward: number;
}

/** Moves lightness from the background toward the text until the color reaches `target` against `against`. */
function solveLightness(
  h: number,
  c: number,
  target: number,
  against: Rgb,
  ctx: Context,
): Lch {
  const at = (t: number): Lch => ({
    l: ctx.bg.l + (ctx.toward - ctx.bg.l) * t,
    c,
    h,
  });
  const t = bisect((x) => wcag(linearOf(at(x), ctx.gamut), against) >= target);
  return at(t);
}

function hover({ l, c, h }: Lch): Lch {
  return l > 0.4
    ? { l: l - 0.03 / (l + 0.1), c: c * 0.93, h }
    : { l: l + 0.03 / (l + 0.1), c, h };
}

/** White when it reaches 4.5:1, else a dark ink in the solid's hue; the better of the two if neither does. */
function onColor(solid: Lch, gamut: Gamut): Lch {
  const fill = linearOf(solid, gamut);
  const ink: Lch = { l: 0.25, c: Math.max(0.08 * solid.c, 0.04), h: solid.h };
  const white = wcag(linearOf(WHITE, gamut), fill);
  const dark = wcag(linearOf(ink, gamut), fill);
  if (white >= TEXT_MIN) return WHITE;
  if (dark >= TEXT_MIN) return ink;
  return white >= dark ? WHITE : ink;
}

/** Darkens the accent at constant hue until white text reaches 4.5:1, or null if that would drift too far. */
function whiteFill(seed: Lch, gamut: Gamut): Lch | null {
  const white = linearOf(WHITE, gamut);
  const target = TEXT_MIN;
  const at = (t: number): Lch => ({ ...seed, l: seed.l - MAX_FILL_SHIFT * t });
  if (wcag(white, linearOf(seed, gamut)) >= target) return seed;
  if (wcag(white, linearOf(at(1), gamut)) < target) return null;
  return at(bisect((t) => wcag(white, linearOf(at(t), gamut)) >= target));
}

/** Keeps a solid whose text already reaches 4.5:1, else darkens it just enough for white text. */
function readableSolid(solid: Lch, gamut: Gamut): Lch {
  const text = linearOf(onColor(solid, gamut), gamut);
  if (wcag(text, linearOf(solid, gamut)) >= TEXT_MIN) return solid;
  return whiteFill(solid, gamut) ?? solid;
}

interface Scale {
  steps: Lch[];
  contrast: Lch;
}

interface ScaleTargets {
  tints: readonly number[];
  text: number;
  textStrong: number;
  textAgainst: Rgb;
}

function tintedScale(
  seed: Lch,
  solid: Lch,
  contrastColor: Lch,
  targets: ScaleTargets,
  ctx: Context,
): Scale {
  const tint = ctx.mode === "dark" ? DARK_TINT_CHROMA : 1;
  const steps = TINT_CHROMA.map((chroma, i) =>
    solveLightness(
      seed.h,
      seed.c * chroma * tint,
      targets.tints[i] ?? 1,
      ctx.bgLinear,
      ctx,
    ),
  );
  const textChroma = Math.max(seed.c * tint, solid.c);
  steps.push(
    solid,
    hover(solid),
    solveLightness(seed.h, textChroma, targets.text, targets.textAgainst, ctx),
    solveLightness(
      seed.h,
      textChroma * 0.7,
      targets.textStrong,
      targets.textAgainst,
      ctx,
    ),
  );
  return { steps, contrast: contrastColor };
}

function hex(linear: Rgb): string {
  return `#${linear
    .map((v) =>
      Math.round(clamp(toGamma(v), 0, 1) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const fixed = (value: number, places: number) =>
  String(Number(value.toFixed(places)));

function emitColor(linear: Rgb, gamut: Gamut): string {
  if (gamut === "srgb" || unit(linear)) return hex(linear);
  const [r, g, b] = linearToP3(linear).map((v) => clamp(toGamma(v), 0, 1));
  return `color(display-p3 ${fixed(r ?? 0, 4)} ${fixed(g ?? 0, 4)} ${fixed(b ?? 0, 4)})`;
}

/** Gamma-encoded channels in the output space, which is where browsers composite alpha. */
function encoded(linear: Rgb, gamut: Gamut): Rgb {
  const space = gamut === "srgb" ? linear : linearToP3(linear);
  return [
    clamp(toGamma(space[0]), 0, 1),
    clamp(toGamma(space[1]), 0, 1),
    clamp(toGamma(space[2]), 0, 1),
  ];
}

/** The most transparent color that composites over `bg` to `target`. */
function emitAlpha(target: Rgb, bg: Rgb, wide: Gamut): string {
  const gamut = unit(target) && unit(bg) ? "srgb" : wide;
  const t = encoded(target, gamut);
  const b = encoded(bg, gamut);
  const needed = t.map((v, i) => {
    const base = b[i] ?? 0;
    if (v > base) return (v - base) / (1 - base);
    if (v < base) return (base - v) / base;
    return 0;
  });
  const alpha = clamp(Math.ceil(Math.max(...needed) * 1000) / 1000, 0, 1);
  const channel = (i: number) => {
    const base = b[i] ?? 0;
    if (alpha === 0) return base;
    return clamp(base + ((t[i] ?? 0) - base) / alpha, 0, 1);
  };
  const a = fixed(alpha, 3);
  if (gamut === "srgb") {
    const c = (i: number) => fixed(channel(i) * 255, 1);
    return `rgb(${c(0)} ${c(1)} ${c(2)} / ${a})`;
  }
  const c = (i: number) => fixed(channel(i), 4);
  return `color(display-p3 ${c(0)} ${c(1)} ${c(2)} / ${a})`;
}

function readColor(input: string, fallback: string): Rgb {
  const [r, g, b] = parseHex(input) ?? parseHex(fallback) ?? [0, 0, 0];
  return [toLinear(r), toLinear(g), toLinear(b)];
}

export const HUE_NAMES = Object.keys(HUE_RAMPS);

/** Gray roles and the ramp step each one takes. */
const GRAY_ROLES = {
  "background-primary": "gray-1",
  "background-secondary": "gray-2",
  "background-tertiary": "gray-3",
  "background-inverse": "gray-12",
  "surface-primary": "gray-a2",
  "surface-secondary": "gray-a3",
  "surface-tertiary": "gray-a4",
  "border-subtle": "gray-a4",
  "border-strong": "gray-a5",
  "foreground-primary": "gray-12",
  "foreground-secondary": "gray-11",
  "foreground-tertiary": "gray-10",
  "foreground-inverse": "gray-1",
} as const;

const DANGER_ROLES = {
  "": "9",
  "-hover": "10",
  "-foreground": "11",
  "-tint": "3",
  "-border": "6",
  "-contrast": "contrast",
} as const;

/** The accent has alpha steps, so its tint and border stay translucent over any surface. */
const ACCENT_ROLES = { ...DANGER_ROLES, "-tint": "a3", "-border": "a7" } as const;

const PALETTE_ROLES = {
  "": "9",
  "-tint": "3",
  "-border": "6",
  "-contrast": "contrast",
} as const;

/** Every `--ds-*` color role, picked from the ramps `solveScales` builds. */
export function buildThemeTokens(input: ThemeInput, gamut: Gamut): ThemeTokens {
  const { mode, tokens: steps } = solveScales(input, gamut);
  const step = (name: string) => steps[`--ds-${name}`] ?? "";
  const tokens: Record<ThemeTokenName, string> = {};
  for (const [role, source] of Object.entries(GRAY_ROLES)) {
    tokens[`--ds-${role}`] = step(source);
  }
  const pick = (name: string, ramp: string, roles: Record<string, string>) => {
    for (const [suffix, source] of Object.entries(roles)) {
      tokens[`--ds-${name}${suffix}`] = step(`${ramp}-${source}`);
    }
  };
  pick("accent", "accent", ACCENT_ROLES);
  pick("danger", "red", DANGER_ROLES);
  for (const name of HUE_NAMES) pick(name, name, PALETTE_ROLES);
  return { mode, tokens };
}

/** Solves the 12-step gray, accent, and hue ramps that the roles are picked from. */
export function solveScales(input: ThemeInput, gamut: Gamut): ThemeTokens {
  const bgLinear = readColor(input.background, FALLBACK.background);
  const fgLinear = readColor(input.foreground, FALLBACK.foreground);
  const bg = linearToLab(bgLinear);
  const fg = linearToLab(fgLinear);
  const mode: ThemeMode = bg.l < fg.l ? "dark" : "light";
  const contrast =
    input.contrast !== undefined && Number.isFinite(input.contrast)
      ? input.contrast
      : 50;
  const stretch = CONTRAST_STRETCH ** ((clamp(contrast, 0, 100) - 50) / 50);
  const stretched = (ratio: number) => (ratio - 1) * stretch + 1;
  const maxRatio = wcag(bgLinear, fgLinear);
  const targets = GRAY_TARGETS[mode];
  const along = (t: number) => shown(labToLinear(mixLab(bg, fg, t)), gamut);
  const solveGray = (target: number, against: Rgb) =>
    along(bisect((t) => wcag(along(t), against) >= target));

  const gray: Rgb[] = [bgLinear];
  let previous = 1;
  for (let i = 0; i < 9; i++) {
    const target = Math.min(
      Math.max(stretched(targets[i] ?? 1), previous * 1.02),
      maxRatio * 0.92,
    );
    gray.push(solveGray(target, bgLinear));
    previous = target;
  }
  const gray2 = gray[1] ?? bgLinear;
  const fgOnGray2 = wcag(fgLinear, gray2);
  const grayText = Math.min(
    Math.max(TEXT_MIN, stretched(targets[9] ?? 1), previous * 1.05),
    fgOnGray2 * 0.8,
  );
  gray.push(solveGray(grayText, gray2), fgLinear);

  const scaleTargets: ScaleTargets = {
    tints: gray
      .slice(0, 8)
      .map((rgb, i) => Math.max(wcag(rgb, bgLinear), 1 + 0.015 * (i + 1))),
    text: Math.max(TEXT_MIN, 1 + (grayText - 1) * 0.45),
    textStrong: Math.max(TEXT_STRONG_MIN, fgOnGray2 * 0.75),
    textAgainst: gray2,
  };
  const ctx: Context = {
    gamut,
    mode,
    bg,
    bgLinear,
    toward: mode === "light" ? 0 : 1,
  };

  const accentSeed = labToLch(
    linearToLab(readColor(input.accent, FALLBACK.accent)),
  );
  const accentFill = whiteFill(accentSeed, gamut);
  const accentSolid = accentFill ?? accentSeed;
  const accent = tintedScale(
    accentSeed,
    accentSolid,
    accentFill ? WHITE : onColor(accentSolid, gamut),
    scaleTargets,
    ctx,
  );

  const tokens: Record<ThemeTokenName, string> = {};
  const writeSteps = (name: string, steps: Rgb[], alpha: boolean) => {
    steps.forEach((color, i) => {
      tokens[`--ds-${name}-${i + 1}`] = emitColor(color, gamut);
    });
    if (!alpha) return;
    steps.forEach((color, i) => {
      tokens[`--ds-${name}-a${i + 1}`] = emitAlpha(color, bgLinear, gamut);
    });
  };
  writeSteps("gray", gray, true);

  const writeScale = (name: string, scale: Scale, alpha: boolean) => {
    writeSteps(
      name,
      scale.steps.map((color) => linearOf(color, gamut)),
      alpha,
    );
    tokens[`--ds-${name}-contrast`] = emitColor(
      linearOf(scale.contrast, gamut),
      gamut,
    );
  };
  writeScale("accent", accent, true);

  for (const [name, ramp] of Object.entries(HUE_RAMPS)) {
    const seed: Lch = { l: ramp.lightness, c: ramp.chroma, h: ramp.hue };
    const solid = readableSolid(
      {
        ...seed,
        c: cMax(ramp.lightness, ramp.hue, "srgb") * HUE_SOLID_CHROMA,
      },
      gamut,
    );
    writeScale(
      name,
      tintedScale(seed, solid, onColor(solid, gamut), scaleTargets, ctx),
      false,
    );
  }

  return { mode, tokens };
}
