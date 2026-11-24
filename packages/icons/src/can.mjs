const can = (poly, s, top) =>
  poly(
    [
      [6.375, top],
      [11.625, top],
      [13.125, top + 2],
      [13.125, 13.625],
      [11.625, 15.625],
      [6.375, 15.625],
      [4.875, 13.625],
      [4.875, top + 2],
    ],
    { closed: true, radius: s.ease },
  );

export default ({ poly }, s) => [
  can(poly, s, 2.375),
  "M 4.875 4.375 H 13.125 M 4.875 13.625 H 13.125",
];

export const open = ({ poly }, s) => [
  can(poly, s, 5.125),
  "M 4.875 7.125 H 13.125",
  "M 10.25 5.125 L 11.375 2.375 H 12.875",
];
