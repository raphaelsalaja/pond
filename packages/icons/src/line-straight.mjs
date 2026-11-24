export default (_h, s) => {
  const [x0, y0, x1, y1] = s.keylines.glyph;
  return `M ${x0} ${y1} L ${x1} ${y0}`;
};
