import dot from "./parts/dot.mjs";

const bulb = ({ snap }) => {
  const [cx, cy, r] = [9, 7.125, 4.75];
  const k = r * Math.SQRT1_2;
  const [l, rr, y] = [snap(cx - k), snap(cx + k), snap(cy + k)];
  return [`M ${l} ${y} A ${r} ${r} 0 1 1 ${rr} ${y} L 11.125 12.5 H 6.875 Z`, "M 7.125 15.125 H 10.875"];
};

export default bulb;

export const open = (h, s) => [bulb(h), dot(h, s, 9, 7.125)];
