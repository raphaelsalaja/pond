import window, { frame } from "./parts/media-window.mjs";

/** Masonry: the columns break at different heights. */
export default (h, s) => {
  const { x0, y0, x1, y1 } = frame(s, "square");
  return [window(s, "square"), `M 9 ${y0} V ${y1}`, `M ${x0} 10.625 H 9`, `M 9 7.375 H ${x1}`];
};
