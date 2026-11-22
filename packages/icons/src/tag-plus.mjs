import badge from "./parts/badge.mjs";
import dot from "./parts/dot.mjs";
import { cut } from "./parts/system-cut.mjs";
import { tag } from "./parts/system-hosts.mjs";

export default (h, s) => {
  const { outline, hole } = tag(h, s);
  return [cut(outline), dot(h, s, ...hole), badge("plus")];
};
