export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const chamfer = 2.75;
  return [
    poly(
      [
        [x0, y0],
        [x1 - chamfer, y0],
        [x1, y0 + chamfer],
        [x1, y1],
        [x0, y1],
      ],
      { closed: true, corners: { 0: s.box, 1: s.ease, 2: s.ease, 3: s.box, 4: s.box } },
    ),
    poly(
      [
        [5.75, y0],
        [5.75, 5.5],
        [10.75, 5.5],
        [10.75, y0],
      ],
      { radius: s.ease },
    ),
    poly(
      [
        [5.25, y1],
        [5.25, 11.5],
        [12.75, 11.5],
        [12.75, y1],
      ],
      { radius: s.ease },
    ),
  ];
};
