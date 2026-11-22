import { head } from "./parts/arrows-head.mjs";

export default (h, s) => {
  const [x0, , x1] = s.keylines.glyph;
  const [y, base] = [7.75, 13.125];
  return [
    `M ${x0} ${y} H ${x1}`,
    head(s, [x1, y], [1, 0], true),
    head(s, [x0, y], [-1, 0], true),
    `M ${s.keylines.square[0]} ${base} H ${s.keylines.square[2]}`,
  ];
};
