import dot from "./parts/dot.mjs";
import ring from "./parts/ring.mjs";

export default (h, s) => [
  ring(h, s),
  "M 9 5.5 V 9.625",
  dot(h, s, 9, 12.5, 0.875),
];
