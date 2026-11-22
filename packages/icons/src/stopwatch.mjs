const [cx, cy, r] = [9, 10.125, 5.5];

const body = ({ circle }) => [
  circle(cx, cy, r),
  `M ${cx} ${cy - r} V 2.375`,
  "M 7.5 2.375 H 10.5",
  "M 12.875 6.25 L 14 5.125",
];

export default (h) => [body(h), `M ${cx} ${cy} V 7.375`];

export const open = (h) => [body(h), `M ${cx} ${cy} L 10.875 8.25`];
