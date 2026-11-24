import dot from "./parts/dot.mjs";

const floor = "M 2.375 15.625 H 15.625";
const frame = (poly, s) =>
  poly(
    [
      [4.375, 15.625],
      [4.375, 2.375],
      [13.625, 2.375],
      [13.625, 15.625],
    ],
    { corners: { 1: s.box, 2: s.box } },
  );

export default (h, s) => [frame(h.poly, s), floor, dot(h, s, 10.75, 9.25)];

/** The leaf swings in on the left jamb, so its free edge reads shorter. */
export const open = (h, s) => [
  frame(h.poly, s),
  h.poly(
    [
      [4.375, 4.875],
      [11, 6.25],
      [11, 13.75],
      [4.375, 15.625],
    ],
    { corners: { 1: s.ease, 2: s.ease } },
  ),
  dot(h, s, 8.125, 10),
];
