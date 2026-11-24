/** A crescent cut by a second circle from the top right; the sparkle sits in the cut. */
const crescent = ({ snap }, s) => {
  const [cx, cy, R] = s.keylines.circle;
  const [ox, oy, r] = [13, 5, 5.5];
  const d = Math.hypot(ox - cx, oy - cy);
  const a = (d * d + R * R - r * r) / (2 * d);
  const hgt = Math.sqrt(R * R - a * a);
  const [ux, uy] = [(ox - cx) / d, (oy - cy) / d];
  const [mx, my] = [cx + a * ux, cy + a * uy];
  const p1 = [snap(mx + hgt * uy), snap(my - hgt * ux)].join(" ");
  const p2 = [snap(mx - hgt * uy), snap(my + hgt * ux)].join(" ");
  return `M ${p1} A ${R} ${R} 0 1 0 ${p2} A ${r} ${r} 0 0 1 ${p1} Z`;
};

export default crescent;

export const open = (h, s) => [
  crescent(h, s),
  "M 13.5 2.375 Q 13.875 4.25 15.625 4.625 Q 13.875 5 13.5 6.875 Q 13.125 5 11.375 4.625 Q 13.125 4.25 13.5 2.375 Z",
];
