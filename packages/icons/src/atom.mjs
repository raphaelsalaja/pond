import dot from "./parts/dot.mjs";

/** Orbits are ellipses tilted 45°, so their tips sit on grid points. */
const orbit = (a, b, rot) =>
  `M ${a[0]} ${a[1]} A 7.75 2.75 ${rot} 1 0 ${b[0]} ${b[1]} A 7.75 2.75 ${rot} 1 0 ${a[0]} ${a[1]} Z`;

export default (h, s) => [
  orbit([3.5, 3.5], [14.5, 14.5], 45),
  orbit([14.5, 3.5], [3.5, 14.5], -45),
  dot(h, s, 9, 9),
];

export const open = (h, s) => [
  orbit([3.5, 3.5], [14.5, 14.5], 45),
  orbit([14.5, 3.5], [3.5, 14.5], -45),
  dot(h, s, 9, 9),
  dot(h, s, 3.5, 6),
  dot(h, s, 12, 3.5),
];
