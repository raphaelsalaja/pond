import badge from "./parts/badge.mjs";
import { star } from "./parts/system-hosts.mjs";

export default (h, s) => [star(h, s), badge("plus")];
