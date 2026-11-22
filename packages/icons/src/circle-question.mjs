import dot from "./parts/dot.mjs";
import ring from "./parts/ring.mjs";

export default (h, s) => [ring(h, s), "M 7 7 A 2 2 0 1 1 10.75 8 C 10.25 8.875 9 9.125 9 10.125", dot(h, s, 9, 12.5, 0.875)];
