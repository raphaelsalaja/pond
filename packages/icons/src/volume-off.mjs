import badge from "./parts/badge.mjs";
import { cut } from "./parts/system-cut.mjs";
import { cone } from "./parts/system-volume.mjs";

/** Muted, so the waves go and the cross takes their place. */
export default (_, s) => [cut(cone(s)), badge("xmark")];
