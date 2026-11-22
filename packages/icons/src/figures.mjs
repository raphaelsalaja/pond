const triangle = (poly, cx, top, half, base) =>
  poly(
    [
      [cx, top],
      [cx + half, base],
      [cx - half, base],
    ],
    { closed: true, radius: 1 },
  );

export default ({ poly, rect, circle }, s) => [
  triangle(poly, 9, 2.375, 3.375, 7.875),
  rect(2.375, 10.375, 5.25, 5.25, s.ease),
  circle(13, 13, 2.625),
];

export const open = ({ poly, circle }, s) => [
  triangle(poly, 5.25, 2.375, 2.875, 7.25),
  circle(5.25, 12.875, 2.75),
  poly(
    [
      [12.5, 5.75],
      [15.625, 8.875],
      [12.5, 12],
      [9.375, 8.875],
    ],
    { closed: true, radius: s.ease },
  ),
];
