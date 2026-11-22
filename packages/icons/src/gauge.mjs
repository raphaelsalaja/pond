import dot from "./parts/dot.mjs";

/** The dial opens at the bottom, so its centre drops to balance the arc. */
export default (h, s) => {
  const [cx, , r] = s.keylines.circle;
  const cy = 9.75;
  return [h.arc(cx, cy, r, 135, 405), dot(h, s, cx, cy), `M ${cx} ${cy} L 11.75 7`];
};
