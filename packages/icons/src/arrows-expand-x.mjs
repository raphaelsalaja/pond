import { head } from "./parts/arrows-head.mjs";

export default (_h, s) => {
  const [x0, , x1] = s.keylines.glyph;
  return [
    `M ${x0} 9 H ${x1}`,
    head(s, [x1, 9], [1, 0], true),
    head(s, [x0, 9], [-1, 0], true),
  ];
};
