import { head } from "./parts/arrows-head.mjs";

export default (h, s) => {
  const [, y0, , y1] = s.keylines.glyph;
  return [`M 9 ${y0} V ${y1}`, head(s, [9, y0], [0, -1], true), head(s, [9, y1], [0, 1], true)];
};
