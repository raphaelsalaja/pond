import { snap } from "../helpers.mjs";
import dot from "./parts/dot.mjs";

const neck = [7.25, 10.75, 6];
const foot = [2.625, 15.375, 15.625];
const liquid = 12;

/** Where a wall sits at height `y`, left wall from the neck to the foot. */
const wall = (y) =>
  snap(neck[0] - ((neck[0] - foot[0]) * (y - neck[2])) / (foot[2] - neck[2]));

const flask = ({ poly }, s) => [
  "M 5.875 2.375 H 12.125",
  poly(
    [
      [neck[0], 2.375],
      [neck[0], neck[2]],
      [foot[0], foot[2]],
      [foot[1], foot[2]],
      [neck[1], neck[2]],
      [neck[1], 2.375],
    ],
    { corners: { 1: s.ease, 2: s.ease, 3: s.ease, 4: s.ease } },
  ),
  `M ${wall(liquid)} ${liquid} H ${18 - wall(liquid)}`,
];

export default flask;

export const open = (h, s) => [flask(h, s), dot(h, s, 9, 8.75)];
