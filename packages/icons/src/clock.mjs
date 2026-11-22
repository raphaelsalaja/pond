import ring from "./parts/ring.mjs";

export default (h, s) => [
  ring(h, s),
  h.poly(
    [
      [9, 5.25],
      [9, 9],
      [11.5, 10.5],
    ],
    { radius: s.ease },
  ),
];
