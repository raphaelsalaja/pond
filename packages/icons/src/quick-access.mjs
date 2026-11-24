/** The command key, as one path. */
export default (_h, s) => {
  const [x0, , x1] = s.keylines.square;
  const r = 2.125;
  const [a, b] = [x0 + r, x1 - r];
  const [lo, hi] = [a + r, b - r];
  const loop = (x, y) => `A ${r} ${r} 0 1 0 ${x} ${y}`;
  return [
    `M ${a} ${lo} H ${b}`,
    loop(hi, a),
    `V ${b}`,
    loop(b, hi),
    `H ${a}`,
    loop(lo, b),
    `V ${a}`,
    loop(a, lo),
    "Z",
  ].join(" ");
};
