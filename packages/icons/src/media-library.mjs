/** One shape per kind of media, in a 2 by 2 grid. */
export default ({ circle, poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const size = 5.25;
  const [a, b] = [x0 + size / 2, x1 - size / 2];
  return [
    circle(a, a, size / 2),
    rect(x1 - size, y0, size, size, s.ease),
    poly(
      [
        [x0 + 0.5, y1 - size],
        [x0 + size, b],
        [x0 + 0.5, y1],
      ],
      { closed: true, radius: s.ease },
    ),
    poly(
      [
        [b, y1 - size],
        [x1, b],
        [b, y1],
        [x1 - size, b],
      ],
      { closed: true, radius: s.ease },
    ),
  ];
};
