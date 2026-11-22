export default ({ poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  return [
    rect(x0, y0, x1 - x0, y1 - y0, s.box),
    poly(
      [
        [5.75, 9.125],
        [8, 11.375],
        [12.25, 7.125],
      ],
      { radius: s.ease },
    ),
  ];
};
