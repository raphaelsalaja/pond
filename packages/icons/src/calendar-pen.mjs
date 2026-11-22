import badge from "./parts/badge.mjs";
import { calendar } from "./parts/system-hosts.mjs";

export default (h, s) => [calendar(h, s), badge("pen")];
