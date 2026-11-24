/** The block stands at 45° on a flat foot that runs on as the ground line. */
export default ({ poly }, s) => {
  const ground = 14.75;
  return [
    poly(
      [
        [5.375, ground],
        [2.875, 12.25],
        [10.75, 4.375],
        [14.25, 7.875],
        [7.375, ground],
      ],
      {
        closed: true,
        corners: { 0: s.ease / 2, 1: s.ease, 2: s.ease, 3: s.ease, 4: 0 },
      },
    ),
    "M 6.5 8.625 L 10 12.125",
    `M 7.375 ${ground} H 15.625`,
  ];
};
