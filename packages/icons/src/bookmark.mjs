export default ({ poly }, s) => {
  const [, y0, , y1] = s.keylines.tall;
  const [x0, x1] = [3.875, 14.125];
  return poly(
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [9, 12.25],
      [x0, y1],
    ],
    {
      closed: true,
      corners: { 0: s.box, 1: s.box, 2: s.ease, 3: s.ease, 4: s.ease },
    },
  );
};

/** The ribbon rides up off the page line, its notch kept the same depth. */
export const open = ({ poly }, s) => {
  const [lo, , hi, y1] = s.keylines.square;
  const [, y0] = s.keylines.tall;
  const [x0, x1] = [3.875, 14.125];
  const tail = 12;
  return [
    poly(
      [
        [x0, y0],
        [x1, y0],
        [x1, tail],
        [9, tail - 3.375],
        [x0, tail],
      ],
      {
        closed: true,
        corners: { 0: s.box, 1: s.box, 2: s.ease, 3: s.ease, 4: s.ease },
      },
    ),
    `M ${lo} ${y1} H ${hi}`,
  ];
};
