import copy from "./copy.mjs";
import dot from "./parts/dot.mjs";

/** The copy sheets with a portrait on the front one, its shoulders resting on the bottom edge. */
export default (h, s) => {
  const front = 6.125;
  const y1 = s.keylines.square[3];
  const c = (front + s.keylines.square[2]) / 2;
  const r = 2.5;
  return [
    copy(h, s),
    dot(h, s, c, 9.75),
    `M ${c - r} ${y1} A ${r} ${r} 0 0 1 ${c + r} ${y1}`,
  ];
};
