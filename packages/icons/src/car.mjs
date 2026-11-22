const wheels = (poly, s) =>
  [3.875, 12.125].map((x) =>
    poly(
      [
        [x, 13.375],
        [x, 15.125],
        [x + 2, 15.125],
        [x + 2, 13.375],
      ],
      { radius: s.ease },
    ),
  );
const lights = "M 4.875 10.75 H 6 M 12 10.75 H 13.125";

export default ({ poly, rect }, s) => [
  rect(2.375, 8, 13.25, 5.375, s.box),
  poly(
    [
      [3.875, 8],
      [5.375, 3.875],
      [12.625, 3.875],
      [14.125, 8],
    ],
    { radius: s.ease },
  ),
  lights,
  wheels(poly, s),
];

/** Roof down: a low windscreen. */
export const open = ({ poly, rect }, s) => [
  rect(2.375, 8, 13.25, 5.375, s.box),
  poly(
    [
      [4.25, 8],
      [5.125, 5.875],
      [12.875, 5.875],
      [13.75, 8],
    ],
    { radius: s.ease },
  ),
  lights,
  wheels(poly, s),
];
