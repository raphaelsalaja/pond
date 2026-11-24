import { arrow } from "./parts/arrows-head.mjs";

export default (_h, s) => {
  const [, y0, , y1] = s.keylines.square;
  const [x0, , x1] = s.keylines.glyph;
  return [`M ${x0} ${y0} H ${x1}`, arrow(s, [9, 5.875], [9, y1])];
};
