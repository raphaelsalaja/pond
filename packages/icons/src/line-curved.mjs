/** Two quarter arcs meeting at the centre. */
export default (h, s) => {
  const [x0, y0, x1, y1] = s.keylines.glyph;
  const r = 9 - x0;
  return `M ${x0} ${y1} A ${r} ${r} 0 0 0 9 9 A ${r} ${r} 0 0 1 ${x1} ${y0}`;
};
