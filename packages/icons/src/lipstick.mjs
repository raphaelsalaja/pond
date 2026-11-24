const bullet = (poly, s, base, low, high, x0 = 6.875, x1 = 11.125) =>
  poly(
    [
      [x0, base],
      [x0, low],
      [x1, high],
      [x1, base],
    ],
    { corners: { 1: s.ease, 2: s.ease } },
  );

export default ({ rect, poly }, s) => [rect(5.25, 8.75, 7.5, 6.875, s.ease), "M 5.25 11.25 H 12.75", bullet(poly, s, 8.75, 5, 2.375)];

/** Twisted up, the inner sleeve shows between the case and the bullet. */
export const open = ({ rect, poly }, s) => [
  rect(5.25, 11, 7.5, 4.625, s.ease),
  "M 6.375 11 V 8.5 H 11.625 V 11",
  bullet(poly, s, 8.5, 4.25, 2.375, 7.375, 10.625),
];
