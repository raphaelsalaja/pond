import { turn } from "./parts/objB-pose.mjs";

const bow = [
  "M 9 6 C 7.25 6 5 5.25 5.25 3.75 C 5.5 2.375 8 3 9 6",
  "M 9 6 C 10.75 6 13 5.25 12.75 3.75 C 12.5 2.375 10 3 9 6",
];

export default ({ rect, poly }, s) => [
  rect(2.375, 6, 13.25, 3, s.ease),
  poly(
    [
      [3.5, 9],
      [3.5, 15.625],
      [14.5, 15.625],
      [14.5, 9],
    ],
    { corners: { 1: s.box, 2: s.box } },
  ),
  "M 9 6 V 15.625",
  bow,
];

export const open = ({ rect }, s) => [
  turn([rect(2.375, 3.25, 13.25, 3, s.ease), "M 9 3.25 V 6.25"], -8, 9, 4.75),
  rect(3.5, 9.5, 11, 6.125, s.box),
  "M 9 9.5 V 15.625",
];
