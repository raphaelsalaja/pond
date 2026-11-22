import dot from "./parts/dot.mjs";

export default (h, s) => {
  const [x0, , x1] = s.keylines.wide;
  return [
    h.rect(x0, 4.375, x1 - x0, 9.25, s.box),
    [5.75, 9, 12.25].map((x) => dot(h, s, x, 7.5, 1)),
    "M 6.25 10.875 H 11.75",
  ];
};
