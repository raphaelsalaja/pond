import dot from "./parts/dot.mjs";
import file from "./parts/file.mjs";

export default (h, s) => [
  file(h, s),
  "M 6.125 9.25 H 11.875",
  "M 6.125 12.75 H 11.875",
  dot(h, s, 8, 9.25),
  dot(h, s, 10, 12.75),
];
