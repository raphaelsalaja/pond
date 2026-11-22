import dot from "./parts/dot.mjs";
import file from "./parts/file.mjs";

export default (h, s) => [file(h, s), "M 9 5.5 V 9.5", dot(h, s, 9, 12.375, 0.875)];
