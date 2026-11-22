import dot from "./parts/dot.mjs";
import { turn } from "./parts/objC-turn.mjs";

const toes = [
  [3.625, 8.375],
  [6.875, 4.875],
  [11.125, 4.875],
  [14.375, 8.375],
];

const pad = [
  [9, 9.125],
  [14.375, 15],
  [3.625, 15],
];

const paw = (h, s, deg) => [
  h.poly(turn(pad, deg, 1, [9, 10]), { closed: true, corners: { 0: 3.5, 1: 2.5, 2: 2.5 } }),
  turn(toes, deg, 1, [9, 10]).map(([x, y]) => dot(h, s, x, y)),
];

export default (h, s) => paw(h, s, 0);

export const open = (h, s) => paw(h, s, -16);
