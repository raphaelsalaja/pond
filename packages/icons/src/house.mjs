export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const eave = 7.25;
  return [
    poly(
      [
        [x0 + 0.5, eave],
        [9, y0],
        [x1 - 0.5, eave],
        [x1 - 0.5, y1],
        [x0 + 0.5, y1],
      ],
      {
        closed: true,
        corners: { 0: s.ease, 1: s.ease, 2: s.ease, 3: s.box, 4: s.box },
      },
    ),
    poly(
      [
        [7.25, y1],
        [7.25, 11],
        [10.75, 11],
        [10.75, y1],
      ],
      { radius: s.ease },
    ),
  ];
};

/** The door stands open: the wall breaks at the threshold and the doorway arches. */
export const open = ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const eave = 7.25;
  return poly(
    [
      [10.75, y1],
      [x1 - 0.5, y1],
      [x1 - 0.5, eave],
      [9, y0],
      [x0 + 0.5, eave],
      [x0 + 0.5, y1],
      [7.25, y1],
      [7.25, 11],
      [10.75, 11],
    ],
    {
      closed: true,
      corners: {
        0: s.ease / 2,
        1: s.box,
        2: s.ease,
        3: s.ease,
        4: s.ease,
        5: s.box,
        6: s.ease / 2,
        7: 1.75,
        8: 1.75,
      },
    },
  );
};
