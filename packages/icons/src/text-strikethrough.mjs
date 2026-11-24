import { S, style } from "./parts/text-letter.mjs";

export default (_h, s) => {
  const [x0, , x1] = s.keylines.glyph;
  return [S(style.x0 + 0.5, style.x1 - 0.5), `M ${x0} 9 H ${x1}`];
};
