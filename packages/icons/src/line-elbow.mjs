export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.glyph;
  return poly(
    [
      [x0, y1],
      [9, y1],
      [9, y0],
      [x1, y0],
    ],
    { radius: s.ease },
  );
};
