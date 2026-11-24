export default ({ poly }, s) => {
  const [, y0, , y1] = s.keylines.square;
  const base = 11.5;
  return [
    poly(
      [
        [6.125, y0],
        [11.875, y0],
        [11.125, 7.5],
        [14, base],
        [4, base],
        [6.875, 7.5],
      ],
      {
        closed: true,
        corners: {
          0: s.ease,
          1: s.ease,
          2: s.ease / 2,
          3: s.ease,
          4: s.ease,
          5: s.ease / 2,
        },
      },
    ),
    `M 9 ${base} V ${y1}`,
  ];
};
