import dot from "./parts/dot.mjs";

const windows = (h, s) => [5.625, 9.375].flatMap((y) => [5.625, 9.375].map((x) => dot(h, s, x, y)));
const annex = "M 12.625 7.25 H 13.375 A 2.25 2.25 0 0 1 15.625 9.5 V 13.375 A 2.25 2.25 0 0 1 13.375 15.625 H 12.625";
const door = "M 6.125 15.625 V 14 A 1.375 1.375 0 0 1 8.875 14 V 15.625";

export default (h, s) => [
  h.poly(
    [
      [2.375, 15.625],
      [2.375, 2.375],
      [12.625, 2.375],
      [12.625, 15.625],
    ],
    { closed: true, corners: { 0: s.box, 1: s.box, 2: s.box, 3: 0 } },
  ),
  annex,
  door,
  windows(h, s),
];

export const open = (h, s) => [
  h.poly(
    [
      [6.125, 15.625],
      [2.375, 15.625],
      [2.375, 2.375],
      [12.625, 2.375],
      [12.625, 15.625],
      [8.875, 15.625],
    ],
    { corners: { 1: s.box, 2: s.box, 3: s.box, 4: 0 } },
  ),
  annex,
  { d: `${door} Z`, fill: true },
  windows(h, s),
];
