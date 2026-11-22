import { cut } from "./parts/system-cut.mjs";
import { cone, waves } from "./parts/system-volume.mjs";

export default (_, s) => [cut(cone(s), []), ...waves().map((w) => cut([w], [], { closed: false }))];
