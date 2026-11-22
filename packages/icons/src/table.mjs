import window, { table } from "./parts/media-window.mjs";

export default (h, s) => {
  const { x0, x1, y1, bar, side, row } = table(s);
  return [window(s), `M ${x0} ${bar} H ${x1}`, `M ${side} ${bar} V ${y1}`, `M ${x0} ${row} H ${x1}`];
};
