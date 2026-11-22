import { arrow, sizes } from "./parts/arrows-head.mjs";

export default (h, s) => {
  const [, y0, , y1] = s.keylines.square;
  const [x0, , x1] = s.keylines.glyph;
  const [top, low] = [y0 + sizes.small, y1 - sizes.small];
  return [arrow(s, [x0, top], [x1, top], true), arrow(s, [x1, low], [x0, low], true)];
};
