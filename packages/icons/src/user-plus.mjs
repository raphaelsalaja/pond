import badge from "./parts/badge.mjs";
import { user } from "./parts/system-hosts.mjs";

export default (h, s) => [user(h, s), badge("plus")];
