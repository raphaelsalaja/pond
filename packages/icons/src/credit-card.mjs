export default ({ rect }, s) => [rect(2.375, 4.125, 13.25, 9.75, s.box), "M 2.375 7.375 H 15.625", "M 5.25 10.875 H 7.75"];

export const open = ({ poly, rect }, s) => [
  rect(2.375, 6.75, 10, 7.875, s.box),
  "M 2.375 9.5 H 12.375",
  poly(
    [
      [5.75, 3.375],
      [15.625, 3.375],
      [15.625, 11.25],
    ],
    { corners: { 1: s.box } },
  ),
];
