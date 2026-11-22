import window, { frame } from "./parts/media-window.mjs";

/** Justified: the rows break at different widths. */
export default (h, s) => {
  const { x0, y0, x1, y1 } = frame(s, "square");
  return [window(s, "square"), `M ${x0} 9 H ${x1}`, `M 10.625 ${y0} V 9`, `M 7.375 9 V ${y1}`];
};
