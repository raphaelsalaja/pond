/** A top sheet and one edge below it, parallel at 3.25. */
export default ({ poly }, s) => {
  const [x0, , x1] = s.keylines.square;
  return [
    poly(
      [
        [9, 3.25],
        [x1, 7],
        [9, 10.75],
        [x0, 7],
      ],
      { closed: true, radius: s.ease },
    ),
    poly(
      [
        [x0, 10.875],
        [9, 14.625],
        [x1, 10.875],
      ],
      { radius: s.ease },
    ),
  ];
};

/** The sheet and the edge below it spread apart, each 0.875 toward the keyline. */
export const open = ({ poly }, s) => {
  const [x0, , x1] = s.keylines.square;
  const lift = 0.875;
  return [
    poly(
      [
        [9, 3.25 - lift],
        [x1, 7 - lift],
        [9, 10.75 - lift],
        [x0, 7 - lift],
      ],
      { closed: true, radius: s.ease },
    ),
    poly(
      [
        [x0, 10.875 + lift],
        [9, 14.625 + lift],
        [x1, 10.875 + lift],
      ],
      { radius: s.ease },
    ),
  ];
};
