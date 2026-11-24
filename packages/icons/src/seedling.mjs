const ground = "M 3.375 15.625 A 7.625 7.625 0 0 1 14.625 15.625";
const leaf = (from, to, r = 6) =>
  `M ${from} A ${r} ${r} 0 0 1 ${to} A ${r} ${r} 0 0 1 ${from} Z`;

export default () => [ground, "M 9 13.125 V 8.75", leaf("9 8.75", "14.75 3")];

/** A second leaf unfolds. */
export const open = () => [
  ground,
  "M 9 13.125 V 9",
  leaf("9 9", "14.625 3.375"),
  leaf("3.375 3.375", "9 9"),
];
