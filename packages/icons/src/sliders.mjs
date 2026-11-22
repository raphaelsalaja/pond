/** Each track stops at its knob. */
export default ({ circle }, s) => {
  const [x0, , x1] = s.keylines.square;
  const r = 2;
  const knob = (x, y) => [`M ${x0} ${y} H ${x - r}`, `M ${x + r} ${y} H ${x1}`, circle(x, y, r)];
  return [knob(6.5, 5.5), knob(11.5, 12.5)];
};
