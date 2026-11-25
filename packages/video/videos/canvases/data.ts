import { cardBox } from "@pond/video";
import type { Box, StrokePoint, Viewport } from "@pond/video";

export const media = (id: string) => `/media/${id}.jpg`;

/** The board's pan and zoom; the canvas fills the panel at 70%. */
export const VIEW: Viewport = { x: 0, y: 0, zoom: 0.7 };

export interface Look {
  id: string;
  title: string;
  meta: string;
  box: Box;
}

/** The Spring Shoot canvas's saves, in board coordinates, listed in the order they land. */
export const LOOKS = {
  lemaire: {
    id: "01M1Z5EJM0DK2SN3NBPY1SKNYD",
    title: "Lemaire AW25, look 28",
    meta: "are.na",
    box: cardBox(90, 150, 200, 1066 / 1600),
  },
  cabin: {
    id: "01KXPDEGV9YA8Q39G77V3HS3AA",
    title: "Kiladalen cabin",
    meta: "cosmos.so",
    box: cardBox(590, 130, 300, 480 / 318),
  },
  chair: {
    id: "01KXAYVKHQ8R54NXFAKFD793TA",
    title: "Wicker chair",
    meta: "are.na",
    box: cardBox(950, 120, 200, 480 / 640),
  },
  auralee: {
    id: "01M1Z5EJM4EJSHHMAQGT0583JE",
    title: "Auralee FW26, look 22",
    meta: "are.na",
    box: cardBox(330, 170, 200, 1066 / 1600),
  },
  suit: {
    id: "01M1Z7ARH6SPW2625B2BVKB13D",
    title: "Grey suit",
    meta: "cosmos.so",
    box: cardBox(1200, 170, 190, 1600 / 1593),
  },
  light: {
    id: "01M1Z7ARH5ZSSS2T9HF1QE5FP4",
    title: "Light study",
    meta: "are.na",
    box: cardBox(1010, 490, 170, 1165 / 1600),
  },
} satisfies Record<string, Look>;

export const NOTE: Box = { x: 640, y: 450, width: 192, height: 192 };
export const NOTE_TEXT = "Shoulder line for the spring shoot.";

/** A hand-drawn loop around the cabin's roofline: a little over one turn, wobbling as a hand does. */
export const LOOP: Array<StrokePoint> = Array.from(
  { length: 64 },
  (_, index) => {
    const p = index / 63;
    const angle = -2.7 + p * Math.PI * 2 * 1.1;
    const wobble = 1 + Math.sin(p * 11) * 0.035 + p * 0.06;
    return [
      735 + Math.cos(angle) * 168 * wobble,
      222 + Math.sin(angle) * 86 * wobble,
      0.5,
    ];
  },
);
