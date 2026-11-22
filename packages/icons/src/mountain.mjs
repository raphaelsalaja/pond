import dot from "./parts/dot.mjs";

const range = ({ poly }, s) => [
  poly(
    [
      [2.375, 14.625],
      [6, 9.25],
      [7.75, 11.25],
      [11.25, 5],
      [15.625, 12.625],
      [15.625, 14.625],
    ],
    { closed: true, radius: s.ease },
  ),
  poly(
    [
      [9.5, 8.125],
      [10.375, 9.25],
      [11.25, 8.125],
      [12.125, 9.25],
      [13, 8.125],
    ],
    { radius: 0.5 },
  ),
];

export default range;

export const open = (h, s) => [range(h, s), dot(h, s, 4.375, 4.5)];
