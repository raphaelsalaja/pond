import badge from "./parts/badge.mjs";
import { frame, open } from "./parts/media-window.mjs";

export default (_h, s) => {
  const { y0, y1, side } = frame(s);
  return [open(s), `M ${side} ${y0} V ${y1}`, badge("pen")];
};
