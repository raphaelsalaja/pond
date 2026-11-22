export default ({ circle, snap }, s) => {
  const r = 2;
  const [x0, y0, x1, y1] = s.keylines.square;
  const [a, b, c] = [
    [x0 + r, 9],
    [x1 - r, y0 + r],
    [x1 - r, y1 - r],
  ];
  const link = (p, q) => {
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const k = r / Math.hypot(dx, dy);
    return `M ${snap(p[0] + dx * k)} ${snap(p[1] + dy * k)} L ${snap(q[0] - dx * k)} ${snap(q[1] - dy * k)}`;
  };
  return [circle(...a, r), circle(...b, r), circle(...c, r), link(a, b), link(a, c)];
};
