import sharp from "sharp";

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

interface Swatch {
  r: number;
  g: number;
  b: number;
  count: number;
  saturation: number;
  score: number;
}

export async function extractPalette(
  input: string | Buffer,
  count = 5,
): Promise<Array<string>> {
  try {
    const size = 64;
    const read = (source: string | Buffer) =>
      sharp(source)
        .resize(size, size, { fit: "inside" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { data, info } = await read(input);

    const channels = info.channels;
    const buckets = new Map<string, Bucket>();
    for (let i = 0; i + channels - 1 < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r === undefined || g === undefined || b === undefined) {
        continue;
      }
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const entry = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      entry.count++;
      entry.r += r;
      entry.g += g;
      entry.b += b;
      buckets.set(key, entry);
    }

    const swatches: Array<Swatch> = Array.from(buckets.values()).map((e) => {
      const r = Math.round(e.r / e.count);
      const g = Math.round(e.g / e.count);
      const b = Math.round(e.b / e.count);
      const { s, l } = toHsl(r, g, b);
      const lightWeight = 0.15 + 0.85 * (1 - Math.abs(l - 0.5) / 0.5);
      const score = e.count * (0.2 + s) * lightWeight;
      return { r, g, b, count: e.count, saturation: s, score };
    });

    const vibrant = swatches
      .filter((sw) => sw.saturation >= 0.15 && isMidtone(sw))
      .sort((a, b) => b.score - a.score);

    const chosen: Array<Swatch> = [];
    const pushUnique = (sw: Swatch) => {
      if (chosen.length >= count) {
        return;
      }
      if (chosen.some((c) => distance(c, sw) < 48)) {
        return;
      }
      chosen.push(sw);
    };
    for (const sw of vibrant) {
      pushUnique(sw);
    }

    if (chosen.length < count) {
      const byFrequency = swatches
        .filter((sw) => !chosen.includes(sw))
        .sort((a, b) => b.count - a.count);
      for (const sw of byFrequency) {
        pushUnique(sw);
      }
    }

    return chosen.map((sw) => toHex(sw.r, sw.g, sw.b));
  } catch {
    return [];
  }
}

function distance(a: Swatch, b: Swatch): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function isMidtone(sw: Swatch): boolean {
  const { l } = toHsl(sw.r, sw.g, sw.b);
  return l > 0.08 && l < 0.95;
}

interface Hsl {
  s: number;
  l: number;
}

function toHsl(r: number, g: number, b: number): Hsl {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const delta = max - min;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

function hexByte(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function toHex(r: number, g: number, b: number): string {
  const h = hexByte;
  return `#${h(r)}${h(g)}${h(b)}`;
}
