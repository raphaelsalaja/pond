import dot from "./parts/dot.mjs";

/** The disc on the circle keyline with a thumb bite at the bottom right. */
const [cx, cy, R] = [9, 9, 6.875];
const bite = { x: 15.75, y: 15.75, r: 4.5 };

const disc = ({ snap }) => {
  const d = Math.hypot(bite.x - cx, bite.y - cy);
  const a = (d * d + R * R - bite.r * bite.r) / (2 * d);
  const hgt = Math.sqrt(R * R - a * a);
  const ux = (bite.x - cx) / d;
  const uy = (bite.y - cy) / d;
  const mx = cx + ux * a;
  const my = cy + uy * a;
  const p1 = [snap(mx - uy * hgt), snap(my + ux * hgt)];
  const p2 = [snap(mx + uy * hgt), snap(my - ux * hgt)];
  return `M ${p1.join(" ")} A ${R} ${R} 0 1 1 ${p2.join(" ")} A ${bite.r} ${bite.r} 0 0 0 ${p1.join(" ")} Z`;
};

const paints = (h, s) => [dot(h, s, 6.25, 6.75), dot(h, s, 10.25, 5.625), dot(h, s, 5.625, 10.75)];

export default (h, s) => [disc(h), ...paints(h, s)];

/** A fresh dab of paint sits in the bite. */
export const open = (h, s) => [disc(h), ...paints(h, s), dot(h, s, 14.5, 14.5)];
