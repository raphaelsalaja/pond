/** Two lobes meeting on 45° tangents across `span`, their centers on `cy`. */
const heart = (snap, span, cy) => {
  const R = snap(span / (2 + Math.SQRT2));
  const k = R * Math.SQRT1_2;
  const tl = [snap(9 - 2 * k), snap(cy + k)];
  const tr = [18 - tl[0], tl[1]];
  const bottom = [9, tl[1] + (9 - tl[0])];
  const top = [9, snap(cy - k)];
  return `M ${bottom.join(" ")} L ${tl.join(" ")} A ${R} ${R} 0 0 1 ${top.join(" ")} A ${R} ${R} 0 0 1 ${tr.join(" ")} Z`;
};

/** Sized to the square keyline. */
export default ({ snap }, s) => {
  const [lo, , hi] = s.keylines.square;
  const span = hi - lo;
  return heart(snap, span, snap(9 - (0.56 * span) / (2 + Math.SQRT2)));
};

/** The heart drops and shrinks so three short rays pop above it. */
export const open = ({ snap }) => [
  heart(snap, 10, 9.375),
  "M 9 2.625 V 4.125",
  "M 3.875 3.375 L 4.875 4.375",
  "M 14.125 3.375 L 13.125 4.375",
];
