import sharp from "sharp";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const NOISE_SCENE_SIZE = 480;

/** A textured scene in four distinct regions; the sensor-noise grain is where lossy compression flips hash bits. */
function noiseScenePixels(seed: number) {
  const rand = mulberry32(seed);
  const size = NOISE_SCENE_SIZE;
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 3;
      const grain = (rand() - 0.5) * 28;
      let red;
      let green;
      let blue;
      if (x < size * 0.5 && y < size * 0.5) {
        const value =
          200 + Math.sin(x * 0.07) * Math.cos(y * 0.056) * 30 + grain;
        red = value;
        green = value * 0.85;
        blue = value * 0.6;
      } else if (x >= size * 0.5 && y < size * 0.5) {
        const value = 60 + Math.sin(x * 0.09) * Math.cos(y * 0.07) * 25 + grain;
        red = value * 0.5;
        green = value * 0.7;
        blue = value + 60;
      } else if (x < size * 0.5) {
        const value =
          130 + Math.sin(x * 0.05) * Math.cos(y * 0.09) * 25 + grain;
        red = value + 70;
        green = value * 0.5;
        blue = value * 0.45;
      } else {
        const value =
          110 + Math.sin(x * 0.11) * Math.cos(y * 0.08) * 25 + grain;
        red = value * 0.5;
        green = value + 40;
        blue = value * 0.5;
      }
      pixels[offset] = Math.max(0, Math.min(255, red));
      pixels[offset + 1] = Math.max(0, Math.min(255, green));
      pixels[offset + 2] = Math.max(0, Math.min(255, blue));
    }
  }
  return pixels;
}

let noiseScene: Promise<Buffer> | null = null;

/** Every comparison test reads the same scene, so generate it once per worker. */
export function noiseSceneJpeg() {
  noiseScene ??= sharp(noiseScenePixels(11), {
    raw: { width: NOISE_SCENE_SIZE, height: NOISE_SCENE_SIZE, channels: 3 },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
  return noiseScene;
}

let noiseSceneRegion: Promise<Buffer> | null = null;

/** The bottom-left quadrant of the noise scene: same image, genuinely different content. */
export function noiseSceneRegionJpeg() {
  const half = Math.round(NOISE_SCENE_SIZE * 0.5);
  noiseSceneRegion ??= sharp(noiseScenePixels(11), {
    raw: { width: NOISE_SCENE_SIZE, height: NOISE_SCENE_SIZE, channels: 3 },
  })
    .extract({ left: 0, top: half, width: half, height: half })
    .jpeg({ quality: 70 })
    .toBuffer();
  return noiseSceneRegion;
}

export async function flatArtJpeg() {
  const size = 1400;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#f5f0e6"/>
    <circle cx="${size * 0.3}" cy="${size * 0.35}" r="${size * 0.22}" fill="#d33f27"/>
    <rect x="${size * 0.5}" y="${size * 0.5}" width="${size * 0.4}" height="${size * 0.4}" fill="#1c3f8f"/>
    <polygon points="${size * 0.7},${size * 0.1} ${size * 0.9},${size * 0.45} ${size * 0.5},${size * 0.45}" fill="#f2b400"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}
