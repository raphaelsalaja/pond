export default ({ circle }) => [
  circle(6.375, 13.125, 2.5),
  "M 8.875 13.125 V 2.375 C 9.5 5.125 13.5 4.5 12.75 9",
];

/** Two beamed notes, heads smaller so the pair keeps the single note's footprint. */
export const open = ({ circle }) => [
  circle(4.875, 13.5, 2.125),
  circle(13.375, 12.25, 2.125),
  "M 7 13.5 V 3.75 L 15.5 2.375 V 12.25",
];
