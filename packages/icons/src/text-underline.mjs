import { U } from "./parts/text-letter.mjs";

export default (h, s) => {
  const [x0, , x1] = s.keylines.glyph;
  return [U(), `M ${x0} ${s.keylines.square[3]} H ${x1}`];
};
