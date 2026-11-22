const pin = (cx, cy, r, tip) => {
  const k = (tip - cy) * 0.45;
  return `M ${cx} ${tip} C ${cx - 1.5} ${tip - 1.25} ${cx - r} ${cy + k} ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} C ${cx + r} ${cy + k} ${cx + 1.5} ${tip - 1.25} ${cx} ${tip} Z`;
};

export default ({ circle }, s) => {
  const [, y0, , y1] = s.keylines.square;
  const r = 5.25;
  return [pin(9, y0 + r, r, y1), circle(9, y0 + r, 2)];
};

/** Dropped: the pin hops up over its spot. */
export const open = ({ circle }, s) => {
  const [, y0, , y1] = s.keylines.square;
  const r = 4.75;
  return [pin(9, y0 + r, r, 12.875), circle(9, y0 + r, 1.75), `M 6 ${y1} H 12`];
};
