/** Selection corners around one shape. */
export default ({ poly, rect }, s) => {
  const [lo, , hi] = s.keylines.square;
  const arm = 3;
  const corner = (x, y, dx, dy) =>
    poly(
      [
        [x, y + dy * arm],
        [x, y],
        [x + dx * arm, y],
      ],
      { corners: { 1: s.box } },
    );
  const k = 5.5;
  return [
    corner(lo, lo, 1, 1),
    corner(hi, lo, -1, 1),
    corner(hi, hi, -1, -1),
    corner(lo, hi, 1, -1),
    rect(9 - k / 2, 9 - k / 2, k, k, s.ease),
  ];
};
