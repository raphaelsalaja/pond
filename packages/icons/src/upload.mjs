export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  return [
    `M 9 10.75 V ${y0}`,
    poly(
      [
        [5.5, y0 + 3.5],
        [9, y0],
        [12.5, y0 + 3.5],
      ],
      { radius: s.ease },
    ),
    poly(
      [
        [x0, 11.25],
        [x0, y1],
        [x1, y1],
        [x1, 11.25],
      ],
      { corners: { 1: s.box, 2: s.box } },
    ),
  ];
};
