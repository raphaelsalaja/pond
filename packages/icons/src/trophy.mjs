import dot from "./parts/dot.mjs";

const cup = [
  "M 5.25 2.375 H 12.75 V 6.375 A 3.75 3.75 0 0 1 5.25 6.375 Z",
  "M 5.25 3.75 H 4 A 1.625 1.625 0 0 0 2.375 5.375 A 2.25 2.25 0 0 0 4.625 7.625 H 5.5",
  "M 12.75 3.75 H 14 A 1.625 1.625 0 0 1 15.625 5.375 A 2.25 2.25 0 0 1 13.375 7.625 H 12.5",
  "M 9 10.125 V 15.625 M 6 15.625 H 12",
];

export default () => cup;

/** The trophy shines. */
export const open = (h, s) => [cup, dot(h, s, 9, 6)];
