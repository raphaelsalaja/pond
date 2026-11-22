export default ({ poly }, s) => [
  "M 4 14 L 14 4",
  poly(
    [
      [8.5, 4],
      [14, 4],
      [14, 9.5],
    ],
    { radius: s.ease },
  ),
];
