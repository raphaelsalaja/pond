import badge from "./parts/badge.mjs";
import { frame, open } from "./parts/media-window.mjs";

export default (h, s) => {
  const { x0, x1, bar } = frame(s);
  return [open(s), `M ${x0} ${bar} H ${x1}`, badge("arrow-down")];
};
