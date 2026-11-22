import badge from "./parts/badge.mjs";
import { clock } from "./parts/system-hosts.mjs";

/** The minute hand turns away from the badge, which would otherwise swallow it. */
export default (h, s) => [clock(h, s), badge("plus")];
