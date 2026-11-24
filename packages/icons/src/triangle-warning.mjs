import dot from "./parts/dot.mjs";
import triangle from "./triangle.mjs";

export default (h, s) => [
  triangle(h, s),
  "M 9 7 V 10",
  dot(h, s, 9, 12.75, 0.875),
];
