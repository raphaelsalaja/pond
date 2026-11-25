import type { FishSpecies } from "@shared/fish-contracts";
import type { Head } from "./face";

type Point = readonly [x: number, y: number];

export interface SpeciesArt {
  /** Tight to the ink, so every species fills its box. */
  viewBox: string;
  /** Overlapping primitives in one fill that read as one outline; the eyes clip to them. */
  body: ReadonlyArray<string>;
  /** Drawn behind the body with its root buried, so it can swing without opening a gap. */
  tail: { d: string; root: Point };
  /** A stalk and bulb that sway on their own, rooted in the head. */
  lure?: { stalk: string; bulb: Point; root: Point };
  head: Head;
  /** Where the body squashes and leans, on its belly. */
  pivot: { x: number; y: number };
}

export const SPECIES_LABELS = {
  koi: "Koi",
  goldfish: "Goldfish",
  puffer: "Puffer",
  clownfish: "Clownfish",
  angelfish: "Angelfish",
  shark: "Shark",
  anglerfish: "Anglerfish",
  sunfish: "Sunfish",
  swordfish: "Swordfish",
  seahorse: "Seahorse",
  betta: "Betta",
  manta: "Manta Ray",
  eel: "Eel",
  catfish: "Catfish",
  lionfish: "Lionfish",
} satisfies Record<FishSpecies, string>;

function oval(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
}

/** Soft cones around an ellipse; angles are degrees clockwise from facing forward. */
function spikes(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angles: ReadonlyArray<number>,
  reach = 1.16,
  base = 1,
): string {
  const at = (angle: number, out: number, side: number) => {
    const a = (angle * Math.PI) / 180;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    const x = cx + nx * rx * out - ny * side;
    const y = cy + ny * ry * out + nx * side;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  };
  return angles
    .map(
      (angle) =>
        `M${at(angle, 0.8, -base)}L${at(angle, reach, -0.42)}Q${at(angle, reach + 0.14, 0)} ${at(angle, reach, 0.42)}L${at(angle, 0.8, base)}Z`,
    )
    .join("");
}

/** Side views facing right on a small grid; the face sits on the main mass, high and forward. */
export const SPECIES_ART = {
  koi: {
    viewBox: "0.8 1.9 17.4 12.5",
    body: [
      oval(11, 8, 7.2, 4.4),
      "M7.8 4.8C8.8 2.8 10.6 1.9 12.2 2C13.7 2.1 15 3.1 15.6 4.8Z",
      "M9.4 11.4C9.6 13.2 10.6 14.4 11.8 14.4C12.8 14.4 13.2 13.4 12.8 11.8Z",
    ],
    tail: {
      d: "M6.4 6.4C5 5.8 3.8 4.6 2.6 4.1C1.6 3.6 0.7 4.2 0.9 5.3C1.1 6.4 1.8 7.3 2.2 8C1.8 8.7 1.1 9.6 0.9 10.7C0.7 11.8 1.6 12.4 2.6 11.9C3.8 11.4 5 10.2 6.4 9.6Z",
      root: [5.6, 8],
    },
    head: { x: 11.8, y: 8.1, rx: 4.6, ry: 3.4 },
    pivot: { x: 11, y: 12.4 },
  },
  goldfish: {
    viewBox: "0.8 1 16.3 14.7",
    body: [
      oval(11.4, 8.8, 5.7, 5.1),
      "M8 5.6C7.6 3.6 7.8 1.8 9 1.2C10.4 0.6 12.4 2 13.6 4.4Z",
      "M8.6 12.6C8.2 14.4 8.8 15.7 10 15.7C10.9 15.7 11.4 14.8 11.2 13.4Z",
    ],
    tail: {
      d: "M7 6.8C5.6 5.4 4.2 4 2.8 3.6C1.6 3.3 0.6 4 0.9 5.3C1.2 6.6 2.2 7.8 2.8 8.8C2.2 9.8 1.2 11 0.9 12.3C0.6 13.6 1.6 14.3 2.8 14C4.2 13.6 5.6 12.2 7 10.8Z",
      root: [6.4, 8.8],
    },
    head: { x: 11.9, y: 8.7, rx: 4.3, ry: 3.8 },
    pivot: { x: 11.4, y: 13.9 },
  },
  puffer: {
    viewBox: "1 2 15.6 14.4",
    body: [
      oval(10.6, 9.2, 6, 5.8),
      spikes(10.6, 9.2, 6, 5.8, [-50, -90, -130, 130, 90, 50]),
    ],
    tail: {
      d: "M5.6 7.6C4.6 6.8 3.4 6 2.3 5.9C1.5 5.8 1 6.4 1.1 7.3C1.2 8 1.7 8.6 2 9.2C1.7 9.8 1.2 10.4 1.1 11.1C1 12 1.5 12.6 2.3 12.5C3.4 12.4 4.6 11.6 5.6 10.8Z",
      root: [5.4, 9.2],
    },
    head: { x: 11.3, y: 9.1, rx: 4.5, ry: 4.3 },
    pivot: { x: 10.6, y: 15 },
  },
  clownfish: {
    viewBox: "0.5 2.6 16.9 12",
    body: [
      oval(11, 8.6, 6.4, 4.7),
      "M5.8 6.4C5.8 4.4 6.8 3 8.2 2.7C9.4 2.5 10.4 3.2 10.7 4.2C11.3 3.6 12.2 3.4 13 3.7C13.9 4 14.4 4.8 14.4 5.6Z",
      "M10.2 11.6C9.9 13.2 10.6 14.6 11.8 14.6C12.8 14.6 13.4 13.6 13.1 12.2Z",
    ],
    tail: {
      d: "M5.8 6.6C4.5 5.5 3.1 4.8 1.9 5C0.9 5.2 0.5 6.6 0.5 8.6C0.5 10.6 0.9 12 1.9 12.2C3.1 12.4 4.5 11.7 5.8 10.6Z",
      root: [5.2, 8.6],
    },
    head: { x: 11.8, y: 8.6, rx: 4.6, ry: 3.6 },
    pivot: { x: 11, y: 13.3 },
  },
  angelfish: {
    viewBox: "2.5 0.1 13.7 19.8",
    body: [
      oval(11.4, 10, 4.8, 5.2),
      "M8.4 6.2C7.6 4.4 6.6 2.4 5.4 0.9C5 0.4 5.4 -0.1 6 0.2C8.6 1.4 11 3 12.8 5.2Z",
      "M8.4 13.8C7.6 15.6 6.6 17.6 5.4 19.1C5 19.6 5.4 20.1 6 19.8C8.6 18.6 11 17 12.8 14.8Z",
    ],
    tail: {
      d: "M7.2 8.6C6.1 7.8 5 7.1 3.9 7C3 6.9 2.5 7.7 2.5 8.8V11.2C2.5 12.3 3 13.1 3.9 13C5 12.9 6.1 12.2 7.2 11.4Z",
      root: [6.8, 10],
    },
    head: { x: 12, y: 9.8, rx: 3.8, ry: 4 },
    pivot: { x: 11.4, y: 15.2 },
  },
  shark: {
    viewBox: "1.6 1 18.4 15",
    body: [
      oval(12.4, 9, 7.6, 4.2),
      "M9.4 5.6C10.2 3.8 11 2.2 11.8 1.3C12.3 0.8 12.9 1 12.9 1.7C13 3 13.4 4.4 14.2 5.4Z",
      "M12 11.8C11.4 13.4 10.6 14.6 9.6 15.2C9 15.6 9.2 16.1 9.9 16C11.7 15.7 13.4 14.5 14.6 12.6Z",
    ],
    tail: {
      d: "M6.2 7.6C4.8 6.2 3.6 4.4 2.8 2.6C2.5 1.9 1.6 2 1.6 2.8C1.6 5 2 7.4 2.8 9C2.2 10.2 1.8 11.4 1.7 12.6C1.7 13.3 2.4 13.5 2.8 12.9C3.8 11.8 5 10.9 6.2 10.4Z",
      root: [5.8, 9],
    },
    head: { x: 13.8, y: 8.8, rx: 5, ry: 3.3 },
    pivot: { x: 12.4, y: 13.2 },
  },
  anglerfish: {
    viewBox: "1.4 0 18.4 15.8",
    body: [oval(11, 10, 6.2, 5.8)],
    tail: {
      d: "M5.8 8.2C4.8 7.3 3.6 6.6 2.6 6.6C1.8 6.6 1.4 7.4 1.4 8.6V11.4C1.4 12.6 1.8 13.4 2.6 13.4C3.6 13.4 4.8 12.7 5.8 11.8Z",
      root: [5.4, 10],
    },
    lure: {
      stalk: "M12 5.4C11.6 2.6 13.2 0.8 15.6 0.8C16.8 0.8 17.6 1.4 18 2.4",
      bulb: [18.2, 3.6],
      root: [12, 5.4],
    },
    head: { x: 11.8, y: 10.2, rx: 4.8, ry: 4.4 },
    pivot: { x: 11, y: 15.8 },
  },
  sunfish: {
    viewBox: "3.7 0.3 13.3 19.4",
    body: [
      oval(11.4, 10, 5.6, 6),
      "M7.6 6.2C7 4.4 6.6 2.6 6.4 1.2C6.3 0.5 6.9 0.1 7.4 0.5C8.8 1.8 10 3.6 10.8 5.2Z",
      "M7.6 13.8C7 15.6 6.6 17.4 6.4 18.8C6.3 19.5 6.9 19.9 7.4 19.5C8.8 18.2 10 16.4 10.8 14.8Z",
    ],
    tail: {
      d: "M6.6 6.4C5.4 6.8 4.4 7.8 4 8.8C3.7 9.6 3.7 10.4 4 11.2C4.4 12.2 5.4 13.2 6.6 13.6Z",
      root: [6.4, 10],
    },
    head: { x: 12.2, y: 10, rx: 4.2, ry: 4.6 },
    pivot: { x: 11.4, y: 16 },
  },
  swordfish: {
    viewBox: "2.4 0.5 21.5 14.7",
    body: [
      oval(12, 9, 6.6, 3.8),
      "M17 8C19.5 8.1 22 8.3 23.4 8.5C24 8.6 24 9.4 23.4 9.5C22 9.7 19.5 9.9 17 10Z",
      "M10.4 5.6C10.8 3.6 11.4 1.8 12.2 0.8C12.6 0.3 13.3 0.5 13.3 1.2C13.4 2.8 13.8 4.2 14.6 5.4Z",
    ],
    tail: {
      d: "M6.6 7.8C5.4 6.4 4.4 4.6 3.6 3.2C3.2 2.6 2.4 2.8 2.5 3.6C2.8 5.6 3.4 7.6 4 9C3.4 10.4 2.8 12.4 2.5 14.4C2.4 15.2 3.2 15.4 3.6 14.8C4.4 13.4 5.4 11.6 6.6 10.2Z",
      root: [6.2, 9],
    },
    head: { x: 13.6, y: 8.8, rx: 4.4, ry: 3 },
    pivot: { x: 12, y: 12.8 },
  },
  seahorse: {
    viewBox: "4.4 1.1 12.6 19.4",
    body: [
      oval(10.4, 4.8, 3.4, 3.1),
      oval(10, 11, 3.8, 4.6),
      spikes(10.4, 4.8, 3.4, 3.1, [-150, -115], 1.2, 0.7),
      spikes(10, 11, 3.8, 4.6, [-150, -175], 1.12, 0.7),
      "M12.6 4.6C14 5.4 15.4 6.2 16.6 7C17.2 7.4 17 8.2 16.3 8.2C14.8 8 13.4 7.6 12 7.2Z",
      "M7 12.8C6.4 15 6.4 17.6 7.6 19.2C8.8 20.8 11.4 20.8 12.6 19.4C13.6 18.2 13.2 16.4 11.8 16.2C10.6 16 10 17 10.4 17.8C10.6 18.3 10.2 18.7 9.7 18.5C8.8 18.1 8.4 16.6 8.8 15L9.8 13.6Z",
    ],
    tail: {
      d: "M6.6 9.6C5.4 9.8 4.4 10.8 4.4 11.8C4.4 12.8 5.4 13.4 6.6 13.4Z",
      root: [6.8, 11.5],
    },
    head: { x: 10.8, y: 4.8, rx: 2.7, ry: 2.4 },
    pivot: { x: 10, y: 20.4 },
  },
  betta: {
    viewBox: "0.8 2.1 17.2 14",
    body: [
      oval(12.6, 9.2, 5.4, 4),
      "M13 5.4C11.8 3.6 10 2.4 8 2.2C6.8 2.1 6.4 3.2 7 4C7.6 4.8 8.2 5.8 8.6 7Z",
      "M13 13C11.6 14.6 9.6 15.8 7.6 16C6.6 16.1 6.2 15.2 6.8 14.5C7.4 13.8 8 12.8 8.4 11.6Z",
    ],
    tail: {
      d: "M8.4 6.4C6.8 4.6 4.8 3.4 3 3.4C1.8 3.4 1.3 4.4 1.5 5.4C0.8 6.2 0.7 7.6 1.3 8.4C0.6 9.4 0.7 10.8 1.5 11.6C1.3 12.6 1.8 13.6 3 13.6C4.8 13.6 6.8 12.4 8.4 11.6Z",
      root: [8, 9.2],
    },
    head: { x: 13.4, y: 9, rx: 4.2, ry: 3.2 },
    pivot: { x: 12.6, y: 13.2 },
  },
  manta: {
    viewBox: "1.2 2.4 17.6 15.4",
    body: [
      oval(10, 9.2, 4.8, 4.4),
      "M7.2 6C6.8 4.6 7 3.2 7.8 2.6C8.4 2.2 9 2.6 9 3.4V5.4Z",
      "M12.8 6C13.2 4.6 13 3.2 12.2 2.6C11.6 2.2 11 2.6 11 3.4V5.4Z",
      "M8.9 12.6C9 14.4 9.2 16 9.5 17.2C9.7 17.9 10.3 17.9 10.5 17.2C10.8 16 11 14.4 11.1 12.6Z",
    ],
    tail: {
      d: "M10 4.4C7.4 4.4 4.6 6 1.6 9C0.9 9.7 1.2 10.6 2.2 10.6C4.6 10.8 7 11.6 8.4 13L11.6 13C13 11.6 15.4 10.8 17.8 10.6C18.8 10.6 19.1 9.7 18.4 9C15.4 6 12.6 4.4 10 4.4Z",
      root: [10, 9.2],
    },
    head: { x: 10.3, y: 9, rx: 3.8, ry: 3.4 },
    pivot: { x: 10, y: 13.6 },
  },
  eel: {
    viewBox: "0.3 2.8 18.7 8.6",
    body: [
      oval(15, 5.8, 4, 2.9),
      "M14.6 3.2C13 3.4 12 4.2 11.2 5.2C10 6.6 8.8 7.2 7.2 7.2C6.4 7.2 5.8 7 5.2 6.8V10.6C7 11.4 9.4 11.4 11 10.2C12.2 9.2 13.6 8.8 15.4 8.7Z",
    ],
    tail: {
      d: "M7.2 7.2C5.8 7 4.6 6.2 3.2 5.4C2.4 5 1.4 4.8 0.8 5.2C0.2 5.6 0.3 6.4 0.9 6.9C2.5 8.2 4 10 5.6 10.8C6.4 11.2 7.2 11.3 8 11.3Z",
      root: [7, 9.4],
    },
    head: { x: 15.6, y: 5.6, rx: 3.2, ry: 2.3 },
    pivot: { x: 12, y: 11 },
  },
  catfish: {
    viewBox: "1.1 3.5 20.1 9.7",
    body: [
      oval(11.4, 9.4, 6.6, 3.8),
      oval(14.2, 9, 4.2, 3.8),
      "M11 6C11.2 4.4 12 3.6 13 3.6C13.8 3.6 14.2 4.4 14.2 5.6Z",
      "M17.4 8C18.6 7.4 19.6 6.6 20.2 5.6C20.5 5.1 21.2 5.3 21.1 5.9C20.9 7.2 19.8 8.6 18 9.4Z",
      "M18 9.6C19.6 10.2 20.6 11 21.1 12.2C21.3 12.8 20.7 13.2 20.3 12.8C19.6 12 18.6 11.4 17.4 11.2Z",
    ],
    tail: {
      d: "M6 8C4.8 7.2 3.6 6.4 2.4 6.2C1.6 6 1 6.6 1.2 7.4C1.4 8.2 1.8 8.8 2.2 9.4C1.8 10 1.4 10.6 1.2 11.4C1 12.2 1.6 12.8 2.4 12.6C3.6 12.4 4.8 11.6 6 10.8Z",
      root: [5.6, 9.4],
    },
    head: { x: 14.4, y: 8.8, rx: 4.2, ry: 3 },
    pivot: { x: 11.4, y: 13.2 },
  },
  lionfish: {
    viewBox: "2 2.1 15.7 15.7",
    body: [
      oval(12, 10, 5.6, 4.4),
      spikes(12, 10, 5.6, 4.4, [-150, -125, -100, -75], 1.75, 0.8),
      "M11 12.4C9.6 13.4 8 15 7.2 16.6C6.9 17.2 7.4 17.7 8 17.4C8.4 17.9 9 17.9 9.4 17.4C9.8 17.9 10.6 17.8 10.8 17.2C11.2 17.6 11.9 17.4 12 16.8C12.4 15.6 12.8 14 13 12.8Z",
    ],
    tail: {
      d: "M7 8.2C5.8 7.4 4.6 6.8 3.4 6.8C2.6 6.8 2.1 7.6 2.1 8.6V11.4C2.1 12.4 2.6 13.2 3.4 13.2C4.6 13.2 5.8 12.6 7 11.8Z",
      root: [6.6, 10],
    },
    head: { x: 12.8, y: 9.8, rx: 4.2, ry: 3.4 },
    pivot: { x: 12, y: 14.4 },
  },
} satisfies Record<FishSpecies, SpeciesArt>;
