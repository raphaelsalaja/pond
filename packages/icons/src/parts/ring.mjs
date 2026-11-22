/** The circle container on the circle keyline. Glyphs inside centre on it. */
export default ({ circle }, s) => {
  const [cx, cy, r] = s.keylines.circle;
  return circle(cx, cy, r);
};
