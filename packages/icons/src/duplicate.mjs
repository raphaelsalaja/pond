import copy from "./copy.mjs";
import plus from "./parts/plus.mjs";

/** The copy sheets with a plus centred on the front one. */
export default (h, s) => {
  const front = 6.125;
  const c = (front + s.keylines.square[2]) / 2;
  return [copy(h, s), plus(c, c)];
};
