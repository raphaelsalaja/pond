/** An open jaw on a heavier handle, like the magnifier's. */
const wrench = ({ arc, snap }, s, turn) => {
  const [cx, cy, r] = [11.75, 6.25, 3.25];
  const gap = 40;
  const neck = [snap(cx - r * Math.SQRT1_2), snap(cy + r * Math.SQRT1_2)];
  return [arc(cx, cy, r, -45 + turn + gap, 315 + turn - gap), { d: `M ${neck.join(" ")} L 3.25 14.75`, width: s.handle }];
};

export default (h, s) => wrench(h, s, 0);

/** The jaw turns as if tightening. */
export const open = (h, s) => wrench(h, s, -30);
