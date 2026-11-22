import dot from "./parts/dot.mjs";

export default (h, s) => {
  const [x0, , x1] = s.keylines.square;
  return [4.5, 9, 13.5].flatMap((y) => [dot(h, s, x0 + 1, y, 1), `M ${x0 + 4.25} ${y} H ${x1}`]);
};
