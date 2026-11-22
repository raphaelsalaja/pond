import { open } from "./parts/media-camera.mjs";
import sparkle from "./parts/media-sparkle.mjs";

export default (h, s) => [open(s, 4.5), h.circle(7.5, 9.75, 2), sparkle()];
