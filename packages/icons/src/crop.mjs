/** Two L-shaped handles, each overshooting the other's corner. */
export default ({ poly }, s) => {
  const [lo, , hi] = s.keylines.square;
  const [near, far] = [5.375, 12.625];
  return [
    poly(
      [
        [near, lo],
        [near, far],
        [hi, far],
      ],
      { corners: { 1: s.ease } },
    ),
    poly(
      [
        [lo, near],
        [far, near],
        [far, hi],
      ],
      { corners: { 1: s.ease } },
    ),
  ];
};
