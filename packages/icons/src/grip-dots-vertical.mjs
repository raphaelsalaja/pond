import dot from "./parts/dot.mjs";

export default (h, s) =>
  [4.25, 9, 13.75].flatMap((y) => [6.75, 11.25].map((x) => dot(h, s, x, y)));
