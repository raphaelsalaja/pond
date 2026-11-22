export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const lid = y0 + 2;
  return [
    poly(
      [
        [x0 + 1.5, lid],
        [x1 - 1.5, lid],
        [x1 - 2.25, y1],
        [x0 + 2.25, y1],
      ],
      { closed: true, corners: { 0: 0, 1: 0, 2: s.box, 3: s.box } },
    ),
    `M ${x0} ${lid} H ${x1}`,
    poly(
      [
        [6.625, lid],
        [6.625, y0],
        [11.375, y0],
        [11.375, lid],
      ],
      { radius: s.ease },
    ),
  ];
};
