/** The back sheet stops one cut short of the front one. */
export default ({ poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const front = 6.125;
  const back = 11.875;
  return [
    rect(front, front, x1 - front, y1 - front, s.box),
    poly(
      [
        [front - s.cut, back],
        [x0, back],
        [x0, y0],
        [back, y0],
        [back, front - s.cut],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.box } },
    ),
  ];
};
