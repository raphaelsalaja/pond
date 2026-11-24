import dot from "./parts/dot.mjs";

export default (h, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  return [
    h.rect(x0, y0, x1 - x0, y1 - y0, s.box),
    `M ${x0} 9 H ${x1}`,
    dot(h, s, 5.625, 5.75, 1),
    dot(h, s, 5.625, 12.25, 1),
  ];
};

/** A unit slides out on its rails. */
export const open = (h, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const shift = 1.5;
  return [
    h.poly(
      [
        [x0 + shift, y0],
        [x1, y0],
        [x1, 9],
        [x0 + shift, 9],
      ],
      { closed: true, corners: { 0: s.box, 1: s.box, 2: s.box, 3: 0 } },
    ),
    h.poly(
      [
        [x0, 9],
        [x1 - shift, 9],
        [x1 - shift, y1],
        [x0, y1],
      ],
      { closed: true, corners: { 0: s.box, 1: 0, 2: s.box, 3: s.box } },
    ),
    dot(h, s, 5.625 + shift, 5.75, 1),
    dot(h, s, 5.625, 12.25, 1),
  ];
};
