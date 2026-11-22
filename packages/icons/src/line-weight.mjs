/** The one icon whose strokes vary in width: three weights, thin to thick. */
export default (h, s) => {
  const [x0, , x1] = s.keylines.glyph;
  return [
    `M ${x0} 4 H ${x1}`,
    { d: `M ${x0} 8.375 H ${x1}`, width: 2 },
    { d: `M ${x0} 13.25 H ${x1}`, width: 3 },
  ];
};
