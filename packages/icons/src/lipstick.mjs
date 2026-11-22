const base = (rect, s) => [rect(5.625, 9.875, 6.75, 5.75, s.ease), "M 5.625 12 H 12.375"];

/** The bullet's slanted tip rises as it twists up. */
const bullet = (poly, s, low, high) =>
  poly(
    [
      [6.875, 9.875],
      [6.875, low],
      [11.125, high],
      [11.125, 9.875],
    ],
    { corners: { 1: s.ease, 2: s.ease } },
  );

export default ({ rect, poly }, s) => [base(rect, s), bullet(poly, s, 6.125, 3.875)];

export const open = ({ rect, poly }, s) => [base(rect, s), bullet(poly, s, 4.625, 2.375)];
