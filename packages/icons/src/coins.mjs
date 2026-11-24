import dot from "./parts/dot.mjs";

/** The back coin's arc stops where it would come within a stroke gap of the front coin. */
export default ({ circle, arc }) => [
  circle(6.875, 11.125, 4.5),
  arc(11.125, 6.875, 4.5, 208, 422),
  "M 6.875 9.375 V 12.875",
];

export const open = (h, s) => [
  h.circle(6, 12, 3.625),
  h.circle(12, 6, 3.625),
  dot(h, s, 6, 12),
  dot(h, s, 12, 6),
];
