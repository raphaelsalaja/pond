import { turn } from "./parts/objC-turn.mjs";

/** Right half, nose to tail; the left half mirrors it. */
const half = [
  [10.5, 3.875],
  [10.5, 7],
  [15.625, 10.125],
  [15.625, 11.5],
  [10.5, 10.375],
  [10.5, 12.875],
  [12.75, 14.5],
  [12.75, 15.625],
];

const points = [...half, ...half.map(([x, y]) => [18 - x, y]).reverse()];
const corners = (s) => ({
  0: 1.5,
  1: s.ease,
  2: 0.5,
  3: 0.5,
  4: s.ease,
  5: s.ease,
  6: 0.5,
  7: 0.5,
  8: 0.5,
  9: 0.5,
  10: s.ease,
  11: s.ease,
  12: 0.5,
  13: 0.5,
  14: s.ease,
  15: 1.5,
});

export default ({ poly }, s) =>
  poly(points, { closed: true, corners: corners(s) });

export const open = ({ poly }, s) =>
  poly(turn(points, 45, 0.92, [9, 9.25]), {
    closed: true,
    corners: corners(s),
  });
