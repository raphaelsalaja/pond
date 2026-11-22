import ring from "./parts/ring.mjs";

export default (h, s) => [
  ring(h, s),
  h.poly(
    [
      [6.125, 9.25],
      [8.25, 11.375],
      [12, 7.625],
    ],
    { radius: s.ease },
  ),
];
