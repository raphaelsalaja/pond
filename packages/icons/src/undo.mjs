import { head, sizes } from "./parts/arrows-head.mjs";

export default (h, s) => {
  const [x0] = s.keylines.glyph;
  const [, y0, x1, y1] = s.keylines.square;
  const top = y0 + sizes.small;
  const r = (y1 - top) / 2;
  const cx = x1 - r;
  return [`M ${x0} ${top} H ${cx} A ${r} ${r} 0 0 1 ${cx} ${y1} H 6.375`, head(s, [x0, top], [-1, 0], true)];
};
