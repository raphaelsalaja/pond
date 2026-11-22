import { arrow } from "./parts/arrows-head.mjs";

export default (h, s) => {
  const [, y0, , y1] = s.keylines.glyph;
  const [l, r] = [5.875, 12.125];
  return [arrow(s, [l, y1], [l, y0], true), arrow(s, [r, y0], [r, y1], true)];
};
