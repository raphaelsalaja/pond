import dot from "./parts/dot.mjs";
import ring from "./parts/ring.mjs";

export default (h, s) => [
  ring(h, s),
  "M 9 8.375 V 12.5",
  dot(h, s, 9, 5.5, 0.875),
];
