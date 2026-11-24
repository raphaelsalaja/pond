import dot from "./parts/dot.mjs";
import { turn } from "./parts/objB-pose.mjs";
import plus from "./parts/plus.mjs";

const pad = (h, s) => [
  "M 2.375 6.125 A 2.25 2.25 0 0 1 4.625 3.875 H 13.375 A 2.25 2.25 0 0 1 15.625 6.125 V 11.625 A 2.5 2.5 0 0 1 10.625 11.625 H 7.375 A 2.5 2.5 0 0 1 2.375 11.625 Z",
  plus(6.25, 7.875, 1.5),
  dot(h, s, 11.75, 7.875),
];

export default pad;

export const open = (h, s) => turn(pad(h, s), -8);
