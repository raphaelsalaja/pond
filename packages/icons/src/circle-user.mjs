import ring from "./parts/ring.mjs";

/** The shoulders end on the ring. */
export default (h, s) => {
  const [cx, cy, r] = s.keylines.circle;
  const a = (125 * Math.PI) / 180;
  const x = h.snap(cx + r * Math.cos(a));
  const y = h.snap(cy + r * Math.sin(a));
  return [
    ring(h, s),
    h.circle(9, 7.25, 2.25),
    `M ${x} ${y} A 4.5 4.5 0 0 1 ${18 - x} ${y}`,
  ];
};
