import badge from "./parts/badge.mjs";
import { trash } from "./parts/system-hosts.mjs";

export default (h, s) => [trash(h, s), badge("xmark")];
