import { arrow } from "./parts/arrows-head.mjs";

export default (h, s) => {
  const [x0] = s.keylines.square;
  const [, y0, , y1] = s.keylines.glyph;
  return [
    `M ${x0} 3.875 H 9.375 M ${x0} 9 H 7.5 M ${x0} 14.125 H 5.625`,
    arrow(s, [12.125, y0], [12.125, y1], true),
  ];
};
