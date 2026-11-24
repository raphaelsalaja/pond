import { arc, outline } from "./system-cut.mjs";

const rad = (deg) => (deg * Math.PI) / 180;
const tip = 8.5;

export const cone = (s) =>
  outline(
    [
      [s.keylines.wide[0], 6.75],
      [5, 6.75],
      [tip, 3.875],
      [tip, 14.125],
      [5, 11.25],
      [s.keylines.wide[0], 11.25],
    ],
    {
      closed: true,
      corners: {
        0: s.ease,
        1: s.ease / 2,
        2: s.ease,
        3: s.ease,
        4: s.ease / 2,
        5: s.ease,
      },
    },
  );

export const waves = () => [
  arc([tip, 9], 3.5, 3.5, rad(-40), rad(80)),
  arc([tip, 9], 6.5, 6.5, rad(-45), rad(90)),
];
