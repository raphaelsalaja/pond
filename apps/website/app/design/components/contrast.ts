const SRGB_Y = [0.2126, 0.7152, 0.0722] as const;
/** Y row of the linear Display P3 to XYZ (D65) matrix. P3 shares the sRGB transfer curve. */
const P3_Y = [0.2289746, 0.6917385, 0.0792869] as const;

type Weights = readonly [number, number, number];

function linearize(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function weigh(
  [r, g, b]: Array<number>,
  weights: Weights,
  encoded = true,
): number {
  const [wr, wg, wb] = weights;
  const lin = encoded ? linearize : (c: number) => c;
  return wr * lin(r ?? 0) + wg * lin(g ?? 0) + wb * lin(b ?? 0);
}

function components(body: string, max: number): Array<number> | null {
  const tokens = body.split(/[\s,/]+/).filter(Boolean);
  if (tokens.length < 3 || tokens.length > 4) return null;
  const values = tokens.map((token, index) => {
    if (token === "none") return 0;
    const value = Number.parseFloat(token);
    if (token.endsWith("%")) return value / 100;
    return index < 3 ? value / max : value;
  });
  return values.some(Number.isNaN) ? null : values;
}

function hex(value: string): Array<number> | null {
  const digits = value.slice(1);
  const size = digits.length <= 4 ? 1 : 2;
  if (![3, 4, 6, 8].includes(digits.length)) {
    return null;
  }
  const values: Array<number> = [];
  for (let i = 0; i < digits.length; i += size) {
    const pair = digits.slice(i, i + size);
    const parsed = Number.parseInt(size === 1 ? pair + pair : pair, 16);
    if (Number.isNaN(parsed)) return null;
    values.push(parsed / 255);
  }
  return values;
}

function opaque(values: Array<number>): boolean {
  return (values[3] ?? 1) >= 0.999;
}

/** Relative luminance of an opaque CSS color, or null when the format or alpha can't be measured. */
export function luminance(color: string): number | null {
  const value = color.trim().toLowerCase();

  if (value.startsWith("#")) {
    const values = hex(value);
    return values && opaque(values) ? weigh(values, SRGB_Y) : null;
  }

  const rgb = /^rgba?\((.+)\)$/.exec(value);
  if (rgb?.[1]) {
    const values = components(rgb[1], 255);
    return values && opaque(values) ? weigh(values, SRGB_Y) : null;
  }

  const fn = /^color\(\s*([\w-]+)\s+(.+)\)$/.exec(value);
  if (fn?.[1] && fn[2]) {
    const values = components(fn[2], 1);
    if (!values || !opaque(values)) return null;
    if (fn[1] === "srgb") return weigh(values, SRGB_Y);
    if (fn[1] === "srgb-linear") return weigh(values, SRGB_Y, false);
    if (fn[1] === "display-p3") return weigh(values, P3_Y);
  }

  return null;
}

export function contrast(a: number, b: number): number {
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}
