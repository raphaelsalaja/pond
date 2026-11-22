import calendar from "./calendar.mjs";
import dot from "./parts/dot.mjs";

export default (h, s) => [calendar(h, s), dot(h, s, 6, 11.5)];
