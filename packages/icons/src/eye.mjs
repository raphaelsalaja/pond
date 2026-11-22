import dot from "./parts/dot.mjs";

export default (h, s) => {
  const [x0, , x1] = s.keylines.wide;
  return [`M ${x0} 9 Q 9 1.5 ${x1} 9 Q 9 16.5 ${x0} 9 Z`, dot(h, s, 9, 9, 2)];
};
