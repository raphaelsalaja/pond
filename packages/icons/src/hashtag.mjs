/** Two slanted stems through two bars, on the glyph keyline. */
const hash = (s, gap, slant) => {
  const [x0, y0, x1, y1] = s.keylines.glyph;
  const stem = (x) => `M ${x + slant} ${y0} L ${x - slant} ${y1}`;
  const bar = (y) => `M ${x0} ${y} H ${x1}`;
  return [
    stem(9 - gap / 2),
    stem(9 + gap / 2),
    bar(9 - gap / 2),
    bar(9 + gap / 2),
  ];
};

export default (_h, s) => hash(s, 5, 0.75);

export const open = (_h, s) => hash(s, 6, 1.25);
