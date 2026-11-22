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

/** The leaf turns on its left hinge, so its free edge reads shorter. */
export const open = (h, s) => [
  floor,
  h.poly(
    [
      [4.375, 15.625],
      [4.375, 2.375],
      [12.125, 4.125],
      [12.125, 13.875],
      [6.625, 15.625],
    ],
    { corners: { 1: s.box, 2: s.ease, 3: s.ease } },
  ),
  dot(h, s, 9.875, 9.25),
];
