const [rx, ry] = [5.625, 2.25];
const [x0, x1] = [9 - rx, 9 + rx];
const lid = (cy) =>
  `M ${x0} ${cy} A ${rx} ${ry} 0 1 0 ${x1} ${cy} A ${rx} ${ry} 0 1 0 ${x0} ${cy} Z`;
const band = (cy) => `M ${x0} ${cy} A ${rx} ${ry} 0 0 0 ${x1} ${cy}`;
const top = 2.375 + ry;
const bottom = 15.625 - ry;

export default () => [
  lid(top),
  `M ${x0} ${top} V ${bottom} A ${rx} ${ry} 0 0 0 ${x1} ${bottom} V ${top}`,
];

export const open = () => [
  lid(top),
  band((top + bottom) / 2),
  `M ${x0} ${top} V ${bottom} A ${rx} ${ry} 0 0 0 ${x1} ${bottom} V ${top}`,
];
