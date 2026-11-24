import dot from "./parts/dot.mjs";

/** A field with three masked characters. */
export default (h, s) => {
  const [x0, , x1] = s.keylines.square;
  const t = 4.875;
  const b = 13.125;
  return [
    h.rect(x0, t, x1 - x0, b - t, s.box),
    ...[5.75, 9, 12.25].map((x) => dot(h, s, x, 9, 1)),
  ];
};
