import { board } from "./clipboard.mjs";

export default (h, s) => [
  board(h, s),
  "M 11.5 10.5 H 6.5",
  h.poly(
    [
      [8.75, 8.25],
      [6.5, 10.5],
      [8.75, 12.75],
    ],
    { radius: s.ease },
  ),
];
