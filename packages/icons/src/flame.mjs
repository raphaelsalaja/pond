import dot from "./parts/dot.mjs";

const flame = (tip, cy, r) =>
  `M 9 ${tip} C ${9 + r * 0.5} ${tip + r * 0.45} ${9 + r} ${cy - r * 0.7} ${9 + r} ${cy} A ${r} ${r} 0 0 1 ${9 - r} ${cy} C ${9 - r} ${cy - r * 0.7} ${9 - r * 0.5} ${tip + r * 0.45} 9 ${tip} Z`;

export default () => [flame(2.375, 10.75, 4.875), flame(8.5, 11.125, 1.75)];

export const open = (h, s) => [flame(2.375, 10.75, 4.875), flame(8.5, 11.125, 1.75), dot(h, s, 3.875, 4), dot(h, s, 14.125, 4)];
