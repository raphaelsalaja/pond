import { head } from "./parts/arrows-head.mjs";

export default (h, s) => ["M 4 14 L 14 4", head(s, [14, 4], [1, -1]), head(s, [4, 14], [-1, 1])];
