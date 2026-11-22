import { snap } from "../../helpers.mjs";

/** The slash cuts top left to bottom right at 45°, across the circle keyline. */
export default ({ keylines }) => {
  const [cx, cy, r] = keylines.circle;
  const k = snap(r * Math.SQRT1_2);
  return `M ${cx - k} ${cy - k} L ${cx + k} ${cy + k}`;
};
