import dot from "./parts/dot.mjs";

export default (h, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  return [
    h.rect(x0, y0, x1 - x0, y1 - y0, s.box),
    h.poly(
      [
        [x0, 11.25],
        [6.5, 7.75],
        [12.75, y1],
      ],
      { radius: s.ease },
    ),
    dot(h, s, 12, 7),
  ];
};

/** In the same frame, the mountain grows and the sun rises. */
export const open = (h, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  return [
    h.rect(x0, y0, x1 - x0, y1 - y0, s.box),
    h.poly(
      [
        [x0, 10.5],
        [6.625, 6.5],
        [13.625, y1],
      ],
      { radius: s.ease },
    ),
    dot(h, s, 12.25, 6.5),
  ];
};
