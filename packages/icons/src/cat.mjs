import dot from "./parts/dot.mjs";

const head = (poly, s) =>
  `${poly(
    [
      [2.625, 9.25],
      [2.625, 3.125],
      [6.625, 5.875],
      [11.375, 5.875],
      [15.375, 3.125],
      [15.375, 9.25],
    ],
    { radius: s.ease },
  )} A 6.375 5.375 0 0 1 2.625 9.25`;

export default ({ poly }, s) => [head(poly, s), "M 5.375 10 A 1.125 1.125 0 0 0 7.625 10 M 10.375 10 A 1.125 1.125 0 0 0 12.625 10"];

export const open = (h, s) => [head(h.poly, s), dot(h, s, 6.5, 10.25), dot(h, s, 11.5, 10.25)];
