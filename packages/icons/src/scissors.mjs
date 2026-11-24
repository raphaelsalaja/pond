/** Blades leave the rings toward the pivot: closed they run together, open they cross. */
const r = 2.375;
const cy = 15.625 - r;
const rings = [5.25, 12.75];

const blade = ({ snap }, cx, to) => {
  const d = Math.hypot(to[0] - cx, to[1] - cy);
  return `M ${snap(cx + ((to[0] - cx) * r) / d)} ${snap(cy + ((to[1] - cy) * r) / d)} L ${to[0]} ${to[1]}`;
};

export default (h, s) => {
  const pivot = [9, 8.5];
  return [
    ...rings.map((x) => h.circle(x, cy, r)),
    ...rings.map((x) => blade(h, x, pivot)),
    `M ${pivot[0]} ${pivot[1]} V ${s.keylines.square[1]}`,
  ];
};

export const open = (h, s) => {
  const [lo, , hi] = s.keylines.square;
  const tip = lo + 0.875;
  return [
    ...rings.map((x) => h.circle(x, cy, r)),
    blade(h, rings[0], [hi - 0.875, tip]),
    blade(h, rings[1], [lo + 0.875, tip]),
  ];
};
