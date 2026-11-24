export default ({ poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  return [
    rect(x0, y0, x1 - x0, y1 - y0, s.box),
    poly(
      [
        [x0 + 1, y0 + 1.25],
        [9, 9.5],
        [x1 - 1, y0 + 1.25],
      ],
      { radius: s.ease },
    ),
  ];
};

/** The flap folds up into a peak; the fold line runs between the shoulders. */
export const open = ({ poly }, s) => {
  const [x0, , x1, y1] = s.keylines.wide;
  const peak = 2.375;
  const shoulder = 7.75;
  return [
    poly(
      [
        [x0, shoulder],
        [9, peak],
        [x1, shoulder],
        [x1, y1],
        [x0, y1],
      ],
      {
        closed: true,
        corners: { 0: s.ease, 1: s.ease, 2: s.ease, 3: s.box, 4: s.box },
      },
    ),
    poly(
      [
        [x0 + 1, shoulder + 1],
        [9, 12],
        [x1 - 1, shoulder + 1],
      ],
      { radius: s.ease },
    ),
  ];
};
