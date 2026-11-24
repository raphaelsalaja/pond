import { T } from "./parts/text-letter.mjs";

export default (_h, s) => {
  const [x0, , x1] = s.keylines.glyph;
  return T(x0, x1);
};
