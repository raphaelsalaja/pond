import {
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  THEME_PRESETS,
} from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEMES } from "./ramps";
import {
  buildThemeTokens,
  type Gamut,
  solveScales,
  type ThemeTokens,
} from "./tokens";

type Rgb = [number, number, number];

interface Painted {
  /** Gamma-encoded channels in the space the value was written in. */
  encoded: Rgb;
  space: Gamut;
  alpha: number;
}

const CONTRASTS = [0, 25, 50, 75, 100];
const GAMUTS: Gamut[] = ["srgb", "p3"];

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/** Linear Display P3 to linear sRGB, from the CSS Color 4 sample code. */
function p3ToSrgb([r, g, b]: Rgb): Rgb {
  return [
    1.2249401 * r - 0.2249404 * g,
    -0.0420569 * r + 1.0420571 * g,
    -0.0196376 * r - 0.0786361 * g + 1.0982735 * b,
  ];
}

function paint(value: string): Painted {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return {
      encoded: [
        ((n >> 16) & 255) / 255,
        ((n >> 8) & 255) / 255,
        (n & 255) / 255,
      ],
      space: "srgb",
      alpha: 1,
    };
  }
  const rgb = /^rgb\(([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)\)$/.exec(value);
  if (rgb) {
    const [, r, g, b, a] = rgb.map(Number);
    return {
      encoded: [(r ?? 0) / 255, (g ?? 0) / 255, (b ?? 0) / 255],
      space: "srgb",
      alpha: a ?? 1,
    };
  }
  const p3 =
    /^color\(display-p3 ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(
      value,
    );
  if (p3) {
    const [, r, g, b] = p3.map(Number);
    return {
      encoded: [r ?? 0, g ?? 0, b ?? 0],
      space: "p3",
      alpha: p3[4] === undefined ? 1 : Number(p3[4]),
    };
  }
  throw new Error(`unexpected token value: ${value}`);
}

const linear = (value: string) => linearOf(paint(value));

function linearOf({ encoded, space }: Painted): Rgb {
  const lin: Rgb = [
    toLinear(encoded[0]),
    toLinear(encoded[1]),
    toLinear(encoded[2]),
  ];
  return space === "srgb" ? lin : p3ToSrgb(lin);
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function ratio(a: string, b: string): number {
  const la = luminance(linear(a));
  const lb = luminance(linear(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function token(theme: ThemeTokens, name: string): string {
  const value = theme.tokens[`--ds-${name}`];
  if (value === undefined) throw new Error(`missing --ds-${name}`);
  return value;
}

function build(
  presetId: string,
  contrast: number,
  gamut: Gamut,
  solve = solveScales,
) {
  const preset = THEME_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`missing preset ${presetId}`);
  return solve({ ...preset.def, contrast }, gamut);
}

const cases = THEME_PRESETS.flatMap((preset) =>
  GAMUTS.flatMap((gamut) =>
    CONTRASTS.map((contrast) => ({ id: preset.id, gamut, contrast })),
  ),
);

describe("solveScales", () => {
  it.each(cases)(
    "$id at contrast $contrast in $gamut keeps text readable",
    ({ id, gamut, contrast }) => {
      const t = build(id, contrast, gamut);
      const gray2 = token(t, "gray-2");
      expect(ratio(token(t, "gray-12"), gray2)).toBeGreaterThanOrEqual(7);
      expect(ratio(token(t, "gray-11"), gray2)).toBeGreaterThanOrEqual(4.5);
      expect(
        ratio(token(t, "gray-11"), token(t, "gray-1")),
      ).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(t, "accent-11"), gray2)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(t, "red-11"), gray2)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(t, "red-12"), gray2)).toBeGreaterThanOrEqual(7);
    },
  );

  it.each(cases)(
    "$id at contrast $contrast in $gamut puts white text on the accent fill",
    ({ id, gamut, contrast }) => {
      const t = build(id, contrast, gamut);
      expect(token(t, "accent-contrast")).toBe("#ffffff");
      expect(ratio("#ffffff", token(t, "accent-9"))).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        ratio(token(t, "red-contrast"), token(t, "red-9")),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(cases)(
    "$id at contrast $contrast in $gamut orders the gray scale",
    ({ id, gamut, contrast }) => {
      const t = build(id, contrast, gamut);
      const gray1 = token(t, "gray-1");
      const ratios = Array.from({ length: 12 }, (_, i) =>
        ratio(token(t, `gray-${i + 1}`), gray1),
      );
      for (let i = 1; i < ratios.length; i++) {
        expect(ratios[i]).toBeGreaterThan(ratios[i - 1] ?? 0);
      }
      const fills = new Set([2, 3, 4, 5].map((n) => token(t, `gray-${n}`)));
      expect(fills.size).toBe(4);
    },
  );

  it.each(cases)(
    "$id at contrast $contrast in $gamut stays inside the gamut",
    ({ id, gamut, contrast }) => {
      const t = build(id, contrast, gamut);
      for (const value of Object.values(t.tokens)) {
        const { encoded, space } = paint(value);
        if (gamut === "srgb") expect(space).toBe("srgb");
        for (const channel of encoded) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    },
  );

  it.each(cases)(
    "$id at contrast $contrast in $gamut composites alphas onto their solids",
    ({ id, gamut, contrast }) => {
      const t = build(id, contrast, gamut);
      const toGamma = (v: number) =>
        v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      /** Linear sRGB to linear Display P3, from the CSS Color 4 sample code. */
      const inSpace = (p: Painted, space: Gamut): Rgb => {
        if (p.space === space) return p.encoded;
        const [r, g, b] = linearOf(p);
        if (space === "srgb") {
          return [toGamma(r), toGamma(g), toGamma(b)];
        }
        return [
          toGamma(0.8224621 * r + 0.1775379 * g),
          toGamma(0.0331942 * r + 0.9668058 * g),
          toGamma(0.0170826 * r + 0.0723974 * g + 0.91052 * b),
        ];
      };
      for (const scale of ["gray", "accent"]) {
        for (let step = 1; step <= 12; step++) {
          const overlay = paint(token(t, `${scale}-a${step}`));
          const bg = inSpace(paint(token(t, "gray-1")), overlay.space);
          const solid = inSpace(
            paint(token(t, `${scale}-${step}`)),
            overlay.space,
          );
          overlay.encoded.forEach((channel, i) => {
            const base = bg[i] ?? 0;
            const composite =
              channel * overlay.alpha + base * (1 - overlay.alpha);
            expect(Math.abs(composite - (solid[i] ?? 0))).toBeLessThan(
              1.5 / 255,
            );
          });
        }
      }
    },
  );

  it("raises every gray step's contrast as the slider rises", () => {
    for (const preset of THEME_PRESETS) {
      const levels = CONTRASTS.map((contrast) =>
        build(preset.id, contrast, "srgb"),
      );
      for (let step = 2; step <= 11; step++) {
        const ratios = levels.map((t) =>
          ratio(token(t, `gray-${step}`), token(t, "gray-1")),
        );
        for (let i = 1; i < ratios.length; i++) {
          expect(ratios[i]).toBeGreaterThanOrEqual((ratios[i - 1] ?? 0) - 0.01);
        }
      }
    }
  });

  it("meets the 3:1 border minimum at full contrast", () => {
    for (const preset of THEME_PRESETS) {
      const t = build(preset.id, 100, "srgb");
      expect(
        ratio(token(t, "gray-8"), token(t, "gray-1")),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(cases)(
    "$id at contrast $contrast in $gamut keeps the focus ring and checked fills at 3:1",
    ({ id, gamut, contrast }) => {
      const t = build(id, contrast, gamut);
      for (const surface of ["gray-1", "gray-2"]) {
        expect(
          ratio(token(t, "accent-9"), token(t, surface)),
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it.each(
    THEME_PRESETS.flatMap((preset) =>
      GAMUTS.map((gamut) => ({ id: preset.id, gamut })),
    ),
  )(
    "$id in $gamut gives control edges 3:1 on both surfaces at full contrast",
    ({ id, gamut }) => {
      const t = build(id, 100, gamut);
      for (const edge of ["gray-8", "gray-9"]) {
        for (const surface of ["gray-1", "gray-2"]) {
          expect(
            ratio(token(t, edge), token(t, surface)),
          ).toBeGreaterThanOrEqual(3);
        }
      }
    },
  );

});

describe("buildThemeTokens", () => {
  it("generates the static defaults from the schema's default themes", () => {
    expect(DEFAULT_THEMES).toEqual({
      light: DEFAULT_LIGHT_THEME,
      dark: DEFAULT_DARK_THEME,
    });
  });

  it("keeps the background and text colors exact", () => {
    const t = buildThemeTokens(
      {
        background: "#F7F3EB",
        foreground: "#1C1914",
        accent: "#C27803",
        contrast: 50,
      },
      "p3",
    );
    expect(token(t, "background-primary")).toBe("#f7f3eb");
    expect(token(t, "foreground-primary")).toBe("#1c1914");
    expect(t.mode).toBe("light");
  });

  it("keeps an accent that already carries white text", () => {
    const t = buildThemeTokens(
      {
        background: "#ffffff",
        foreground: "#1b1b1b",
        accent: "#2563EB",
        contrast: 50,
      },
      "srgb",
    );
    expect(token(t, "accent")).toBe("#2563eb");
  });

  it("emits the same token names for every theme and gamut", () => {
    const names = Object.keys(
      build("light", 50, "srgb", buildThemeTokens).tokens,
    ).sort();
    expect(names).toContain("--ds-accent-contrast");
    expect(names).toContain("--ds-danger-foreground");
    expect(names).toContain("--ds-pink-tint");
    expect(names).not.toContain("--ds-pink-foreground");
    expect(names).toContain("--ds-surface-tertiary");
    expect(names.some((name) => /-a?\d+$/.test(name))).toBe(false);
    for (const gamut of GAMUTS) {
      expect(
        Object.keys(build("dark", 0, gamut, buildThemeTokens).tokens).sort(),
      ).toEqual(names);
    }
  });

  it("falls back to the default palette for unreadable input", () => {
    const t = buildThemeTokens(
      {
        background: "not a color",
        foreground: "",
        accent: "#12",
        contrast: Number.NaN,
      },
      "srgb",
    );
    expect(t.mode).toBe("light");
    expect(token(t, "background-primary")).toBe("#ffffff");
    for (const value of Object.values(t.tokens)) {
      expect(value).not.toContain("NaN");
    }
  });
});
