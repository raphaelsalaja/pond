import { arrow } from "./parts/arrows-head.mjs";
import ring from "./parts/ring.mjs";

export default (h, s) => [ring(h, s), arrow(s, [9, 12.75], [9, 5.25], true)];
