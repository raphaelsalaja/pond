const handle = (poly, s, y) =>
  poly(
    [
      [6.75, y + 2.25],
      [6.75, y],
      [11.25, y],
      [11.25, y + 2.25],
    ],
    { radius: s.ease },
  );

export default ({ poly, rect }, s) => [
  rect(2.375, 5.375, 13.25, 9.25, s.box),
  "M 2.375 9.5 H 15.625",
  handle(poly, s, 3.125),
];

export const open = ({ poly, rect }, s) => [
  rect(2.375, 4.625, 13.25, 3.875, s.box),
  poly(
    [
      [2.375, 10.25],
      [2.375, 14.625],
      [15.625, 14.625],
      [15.625, 10.25],
    ],
    { closed: true, corners: { 0: s.ease, 1: s.box, 2: s.box, 3: s.ease } },
  ),
  handle(poly, s, 2.375),
];
