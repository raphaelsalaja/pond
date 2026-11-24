import { arrow } from "./parts/arrows-head.mjs";

export default (_h, s) => {
  const [, y0, , y1] = s.keylines.square;
  const [x0, , x1] = s.keylines.glyph;
  return [arrow(s, [9, 12.125], [9, y0]), `M ${x0} ${y1} H ${x1}`];
};
