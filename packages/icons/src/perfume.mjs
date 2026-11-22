import dot from "./parts/dot.mjs";

const bottle = ({ rect }, s, x) => [
  rect(x, 7.375, 10.25, 8.25, s.box),
  rect(x + 2.5, 2.375, 5.25, 2.75, s.ease),
  `M ${x + 3.625} 5.125 V 7.375 M ${x + 6.625} 5.125 V 7.375`,
];

export default (h, s) => bottle(h, s, 3.875);

export const open = (h, s) => [bottle(h, s, 2.375), dot(h, s, 12.75, 3.75), dot(h, s, 14.875, 6.375)];
