import square from "./square.mjs";

export default (h, s) => [
  square(h, s),
  h.poly(
    [
      [7.75, 6.5],
      [5.25, 9],
      [7.75, 11.5],
    ],
    { radius: s.ease },
  ),
  h.poly(
    [
      [10.25, 6.5],
      [12.75, 9],
      [10.25, 11.5],
    ],
    { radius: s.ease },
  ),
];
