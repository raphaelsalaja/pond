import type { FishSpecies } from "./types";

type Lobe = readonly [cx: number, cy: number, r: number];

export interface SpeciesArt {
  /** Overlapping circles that union into one lumpy silhouette; each wobbles on its own beat. */
  lobes: readonly Lobe[];
  fins?: string;
  /** Clipped to the lobes, so bands end exactly at the silhouette while it wobbles. */
  stripes?: string;
  /** Whiskers and lure stalks, drawn as lines beside the body. */
  strokes?: string;
  bulb?: readonly [number, number];
  eyes: readonly [readonly [number, number], readonly [number, number]];
  eyeScale: number;
}

function ring(count: number, radius: number, r: number): Lobe[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return [
      Number((12 + Math.cos(angle) * radius).toFixed(2)),
      Number((12 + Math.sin(angle) * radius).toFixed(2)),
      r,
    ] as const;
  });
}

/** Drawn on a 24-unit grid facing right; every eye path shares one command list so CSS can morph between them. */
export const SPECIES_ART = {
  koi: {
    lobes: [
      [7, 13, 4.6],
      [11.5, 10.5, 5],
      [15.5, 11.5, 5],
      [12, 15.6, 4.4],
      [17.2, 15.2, 3.4],
      [4.2, 10.8, 2.6],
      [9.6, 6, 2.4],
    ],
    strokes:
      "M20.4 14.6C22 14.8 22.6 16 22.2 17.2M19.4 17.6C20.4 18.4 20.4 19.8 19.6 20.6",
    eyes: [
      [13, 11],
      [17.6, 11],
    ],
    eyeScale: 1.3,
  },
  goldfish: {
    lobes: [
      [12, 12.6, 6.4],
      [6.8, 13.6, 4],
      [16.4, 10.6, 4.6],
      [15, 16.2, 4],
      [8.8, 8, 3.6],
      [12.6, 5.4, 2.4],
      [8, 18.4, 2.2],
    ],
    eyes: [
      [13.2, 11],
      [17.8, 11],
    ],
    eyeScale: 1.3,
  },
  puffer: {
    lobes: [[12, 12, 6.8], ...ring(14, 7.2, 2.1)],
    eyes: [
      [12, 11.4],
      [16.6, 11.4],
    ],
    eyeScale: 1.35,
  },
  clownfish: {
    lobes: [
      [6.6, 12.6, 4.4],
      [11, 10.6, 5.2],
      [15.6, 11.6, 5],
      [11.4, 15.6, 4.4],
      [17, 15.2, 3.6],
      [11.6, 6, 2.4],
    ],
    stripes: "M7.2 2H8.4V22H7.2ZM10.2 2H11.2V22H10.2Z",
    eyes: [
      [14.6, 11.2],
      [19, 11.2],
    ],
    eyeScale: 1.25,
  },
  angelfish: {
    lobes: [
      [12.4, 12, 5.4],
      [9, 9.4, 3.4],
      [9, 14.6, 3.4],
      [16, 12, 4.2],
      [6, 12, 2.6],
    ],
    fins: "M8 8.4L6.6 1.6C6.5 1 7.1 0.7 7.5 1.1L14 7.4ZM14 16.6L7.5 22.9C7.1 23.3 6.5 23 6.6 22.4L8 15.6Z",
    eyes: [
      [13, 11.4],
      [17.4, 11.4],
    ],
    eyeScale: 1.25,
  },
  shark: {
    lobes: [
      [5.8, 13, 3.4],
      [10, 12.4, 4.4],
      [14.6, 12.2, 4.6],
      [18.8, 13, 3.4],
      [12.4, 15.8, 3.4],
      [16.6, 16, 2.4],
    ],
    fins: "M9.6 9L12.2 2.6C12.5 2 13.2 2.1 13.3 2.7L15.2 8.4Z",
    eyes: [
      [15, 11.6],
      [19.2, 11.8],
    ],
    eyeScale: 1.15,
  },
  anglerfish: {
    lobes: [
      [12, 13.2, 6.4],
      [7, 12.2, 4],
      [16.8, 11.6, 4.4],
      [16.4, 16.6, 3.6],
      [8.4, 17.2, 3.4],
    ],
    strokes: "M12.2 6.8C12 3.4 15.4 1.4 18.6 2.6",
    bulb: [19.4, 3.4],
    eyes: [
      [12.2, 11.2],
      [16.6, 11.2],
    ],
    eyeScale: 1.2,
  },
  sunfish: {
    lobes: [
      [12, 12, 6.6],
      [8, 8.6, 3.8],
      [8, 15.4, 3.8],
      [16, 12, 4.6],
      [9, 5.6, 2.4],
      [8.4, 3.2, 2],
      [9, 18.4, 2.4],
      [8.4, 20.8, 2],
    ],
    eyes: [
      [13.2, 11.2],
      [17.6, 11.2],
    ],
    eyeScale: 1.3,
  },
} satisfies Record<FishSpecies, SpeciesArt>;

export type FishFace = "neutral" | "think" | "scan" | "happy" | "sad";

export const EYE_PATHS = {
  neutral:
    "M0 -1.45C0.68 -1.45 1.2 -0.82 1.2 0C1.2 0.82 0.68 1.45 0 1.45C-0.68 1.45 -1.2 0.82 -1.2 0C-1.2 -0.82 -0.68 -1.45 0 -1.45Z",
  think:
    "M0 -1.5C0.64 -1.5 1.1 -0.9 1.1 0C1.1 0.9 0.64 1.4 0 1.4C-0.64 1.4 -1.1 0.9 -1.1 0C-1.1 -0.9 -0.64 -1.5 0 -1.5Z",
  scan: "M0 -0.5C0.74 -0.5 1.25 -0.36 1.25 0.3C1.25 1 0.7 1.4 0 1.4C-0.7 1.4 -1.25 1 -1.25 0.3C-1.25 -0.36 -0.74 -0.5 0 -0.5Z",
  happy:
    "M0 -1.3C0.8 -1.3 1.3 -0.4 1.3 0.6C0.92 0.6 0.6 -0.1 0 -0.1C-0.6 -0.1 -0.92 0.6 -1.3 0.6C-1.3 -0.4 -0.8 -1.3 0 -1.3Z",
  sad: "M0 -1C0.6 -1 1 -0.6 1 0.2C1 1 0.58 1.4 0 1.4C-0.58 1.4 -1 1 -1 0.2C-1 -0.6 -0.6 -1 0 -1Z",
} satisfies Record<FishFace, string>;

export const HEART_PATH =
  "M0 1.2C-0.3 1 -1.4 0.2 -1.4 -0.5C-1.4 -1 -1 -1.3 -0.6 -1.3C-0.3 -1.3 -0.1 -1.1 0 -0.9C0.1 -1.1 0.3 -1.3 0.6 -1.3C1 -1.3 1.4 -1 1.4 -0.5C1.4 0.2 0.3 1 0 1.2Z";
