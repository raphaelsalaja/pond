import dot from "./parts/dot.mjs";

/** Two nodes on the board, joined by an elbow. */
export default (h, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const [a, b] = [6, 12];
  return [
    h.rect(x0, y0, x1 - x0, y1 - y0, s.box),
    h.poly(
      [
        [a, a],
        [b, a],
        [b, b],
      ],
      { radius: s.ease },
    ),
    dot(h, s, a, a),
    dot(h, s, b, b),
  ];
};
