import badge from "./parts/badge.mjs";
import dot from "./parts/dot.mjs";

/** `eye.mjs` shrunk into the top left so it clears the badge hole whole. */
export default (h, s) => {
  const [x0] = s.keylines.wide;
  const x1 = 13.625;
  const cx = (x0 + x1) / 2;
  const cy = 7.5;
  const lift = 6.375;
  return [
    `M ${x0} ${cy} Q ${cx} ${cy - lift} ${x1} ${cy} Q ${cx} ${cy + lift} ${x0} ${cy} Z`,
    dot(h, s, cx, cy, 1.75),
    badge("plus"),
  ];
};
