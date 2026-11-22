import { base, T, top } from "./parts/text-letter.mjs";

/** A large T and a small one on a shared baseline. */
export default (h, s) => {
  const [x0, , x1] = s.keylines.square;
  return [T(x0, 10.125, top, base), T(11.375, x1, 8.375, base)];
};
