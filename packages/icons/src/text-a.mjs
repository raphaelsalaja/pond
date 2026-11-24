import { A } from "./parts/text-letter.mjs";

export default (_h, s) => {
  const [x0, , x1] = s.keylines.glyph;
  return A(x0 + 0.5, x1 - 0.5);
};
