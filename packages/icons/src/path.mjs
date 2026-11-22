/** A route that doubles back twice, from one node to the other. */
export default ({ circle }, s) => {
  const r = 1.75;
  const [a, b] = [s.keylines.square[0] + r, s.keylines.square[2] - r];
  const [y0, y1, y2] = [4.25, 9, 13.75];
  const bend = (y1 - y0) / 2;
  return [
    circle(a, y2, r),
    circle(b, y0, r),
    `M ${a + r} ${y2} H ${b - 2.625} A ${bend} ${bend} 0 0 0 ${b - 2.625} ${y1} H ${a + 2.625} A ${bend} ${bend} 0 0 1 ${a + 2.625} ${y0} H ${b - r}`,
  ];
};
