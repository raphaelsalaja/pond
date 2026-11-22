import badge from "./parts/badge.mjs";
import funnel from "./parts/shapes-filter.mjs";

export default (h, s) => [funnel(h, s), badge("plus")];
