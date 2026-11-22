import dot from "./parts/dot.mjs";

const cart = (h, s) => [
  h.poly(
    [
      [2.375, 2.875],
      [3.625, 2.875],
      [5.375, 11.75],
      [14.375, 11.75],
    ],
    { radius: s.ease },
  ),
  h.poly(
    [
      [4.125, 5.25],
      [15.625, 5.25],
      [14.375, 9.375],
      [4.875, 9.375],
    ],
    { corners: { 1: s.ease, 2: s.ease } },
  ),
  dot(h, s, 6.625, 14.875),
  dot(h, s, 13, 14.875),
];

export default (h, s) => cart(h, s);

export const open = (h, s) => [
  cart(h, s),
  h.poly(
    [
      [7.5, 5.25],
      [7.5, 2.375],
      [12.5, 2.375],
      [12.5, 5.25],
    ],
    { radius: s.ease },
  ),
];
