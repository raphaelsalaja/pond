export default ({ poly }, s) => [
  poly(
    [
      [5.75, 6.75],
      [9, 3.5],
      [12.25, 6.75],
    ],
    { radius: s.ease },
  ),
  poly(
    [
      [5.75, 11.25],
      [9, 14.5],
      [12.25, 11.25],
    ],
    { radius: s.ease },
  ),
];
