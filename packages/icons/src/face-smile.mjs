import dot from "./parts/dot.mjs";
import ring from "./parts/ring.mjs";

const eyes = (h, s) => [dot(h, s, 6.75, 7.25), dot(h, s, 11.25, 7.25)];

export default (h, s) => [ring(h, s), eyes(h, s), h.arc(9, 9.5, 3.25, 30, 150)];

export const open = (h, s) => [
  ring(h, s),
  eyes(h, s),
  "M 5.75 10.25 H 12.25 A 3.25 3.25 0 0 1 5.75 10.25 Z",
];
