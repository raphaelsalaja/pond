import ring from "./parts/ring.mjs";
import slash from "./parts/slash.mjs";

export default (h, s) => [ring(h, s), slash(s)];
