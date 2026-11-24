import { move, turn } from "./parts/objB-pose.mjs";

const lid = (rect, s) => rect(4.375, 4.25, 9.25, 2.5, s.ease);

const body = ({ poly }, s) =>
  poly(
    [
      [5, 6.75],
      [3.375, 8.5],
      [3.375, 15.625],
      [14.625, 15.625],
      [14.625, 8.5],
      [13, 6.75],
    ],
    { corners: { 1: s.ease, 2: s.box, 3: s.box, 4: s.ease } },
  );

export default (h, s) => [lid(h.rect, s), body(h, s)];

export const open = (h, s) => [
  move(turn(lid(h.rect, s), -6, 9, 5.5), 0, -1.5),
  body(h, s),
];
