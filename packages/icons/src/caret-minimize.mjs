import { arrow } from "./parts/arrows-head.mjs";

export default (h, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  return [arrow(s, [x1, y0], [10, 8], true), arrow(s, [x0, y1], [8, 10], true)];
};
