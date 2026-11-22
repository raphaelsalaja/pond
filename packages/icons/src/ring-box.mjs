import dot from "./parts/dot.mjs";

const seam = 10;

const base = (s) => {
  const [x0, , x1, y1] = s.keylines.wide;
  const b = s.box;
  return `M ${x0} ${seam} V ${y1 - b} A ${b} ${b} 0 0 0 ${x0 + b} ${y1} H ${x1 - b} A ${b} ${b} 0 0 0 ${x1} ${y1 - b} V ${seam} Z`;
};

export default (_, s) => {
  const [x0, , x1] = s.keylines.wide;
  const [rx, ry] = [(x1 - x0) / 2, 5.125];
  return [base(s), `M ${x0} ${seam} A ${rx} ${ry} 0 0 1 ${x1} ${seam}`];
};

/** The lid stands open behind the ring, which sits in the slot at the seam. */
export const open = (h, s) => {
  const [x0, , x1] = s.keylines.wide;
  const [rx, ry, top] = [(x1 - x0) / 2, 4.75, 2.375];
  const [cx, cy, r] = [9, 9.125, 2.25];
  const dx = Math.sqrt(r * r - (seam - cy) ** 2);
  return [
    base(s),
    `M ${x0} ${seam} V ${top + ry} A ${rx} ${ry} 0 0 1 ${x1} ${top + ry} V ${seam}`,
    `M ${h.pt([cx - dx, seam])} A ${r} ${r} 0 1 1 ${h.pt([cx + dx, seam])}`,
    dot(h, s, cx, cy - r - 0.25),
  ];
};
