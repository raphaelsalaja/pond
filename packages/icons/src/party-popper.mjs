import dot from "./parts/dot.mjs";

const cone = ({ poly }, s) =>
  poly(
    [
      [2.625, 15.375],
      [11.875, 11.625],
      [6.375, 6.125],
    ],
    { closed: true, corners: { 0: 0.75, 1: s.ease, 2: s.ease } },
  );

export default (h, s) => [
  cone(h, s),
  "M 11.625 6.125 L 13.75 4",
  dot(h, s, 10.25, 3.25),
  dot(h, s, 14.75, 8.75),
];

/** More confetti bursts out. */
export const open = (h, s) => [
  cone(h, s),
  "M 11.625 6.125 L 13.75 4",
  "M 8 2.375 V 3.875",
  "M 14.125 13 H 15.625",
  dot(h, s, 10.75, 2.875),
  dot(h, s, 15, 9),
];
