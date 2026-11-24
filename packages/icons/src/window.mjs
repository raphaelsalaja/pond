import window, { frame } from "./parts/media-window.mjs";

export default (_h, s) => {
  const { x0, x1, bar } = frame(s);
  return [window(s), `M ${x0} ${bar} H ${x1}`];
};
