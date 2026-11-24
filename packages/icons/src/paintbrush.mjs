/** A pointed bristle head, a ferrule, then the handle out to the top right. */
const brush = (o, reach) => {
  const p = (x, y) => `${o[0] + x} ${o[1] + y}`;
  const r = 2.5;
  return [
    `M ${p(0, 0)} V ${o[1] - 2.5} A ${r} ${r} 0 0 1 ${p(2.5, -5)} L ${p(4.75, -7.25)} L ${p(7.25, -4.75)} L ${p(5, -2.5)} A ${r} ${r} 0 0 1 ${p(2.5, 0)} Z`,
    `M ${p(2.5, -5)} L ${p(5, -2.5)}`,
    `M ${p(6, -6)} L ${p(reach, -reach)}`,
  ];
};

export default (_h, s) => {
  const [x0, , , y1] = s.keylines.square;
  return brush([x0 + 0.75, y1 - 0.75], 12);
};

/** Lifted mid-stroke over the line it just painted. */
export const open = (_h, s) => {
  const [x0, , x1, y1] = s.keylines.square;
  return [brush([x0 + 1.125, y1 - 2.875], 10), `M ${x0} ${y1} H ${x1 - 5.125}`];
};
