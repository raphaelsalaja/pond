import window, { frame } from "./parts/media-window.mjs";

export default (_h, s) => {
  const { y0, y1, side } = frame(s);
  return [window(s), `M ${side} ${y0} V ${y1}`];
};
