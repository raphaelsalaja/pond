/** Links stop short of each node by a gap so the rings stay whole. */
export default ({ circle, snap }, s) => {
  const r = 2;
  const gap = 0.75;
  const lo = s.keylines.square[0] + r;
  const nodes = [
    [9, 4.875],
    [18 - lo, 12.875],
    [lo, 12.875],
  ];
  const link = (p, q) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const u = [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
    const k = r + gap;
    return `M ${snap(p[0] + u[0] * k)} ${snap(p[1] + u[1] * k)} L ${snap(q[0] - u[0] * k)} ${snap(q[1] - u[1] * k)}`;
  };
  return [
    ...nodes.map(([x, y]) => circle(x, y, r)),
    link(nodes[0], nodes[1]),
    link(nodes[1], nodes[2]),
    link(nodes[2], nodes[0]),
  ];
};
