export default ({ arc }, s) => {
  const [, y0, , y1] = s.keylines.square;
  const r = 6.5;
  const cy = y1 - r;
  return [arc(9, cy, r, -50, 230), `M 9 ${y0} V 8.5`];
};
