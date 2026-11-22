import dot from "./parts/dot.mjs";

export default ({ poly, rect }, s) => {
  const [x0, , x1] = s.keylines.wide;
  const body = 11.875;
  return [
    rect(x0, 4, body - x0, 10, s.box),
    poly(
      [
        [body + 0.75, 7.5],
        [x1, 5],
        [x1, 13],
        [body + 0.75, 10.5],
      ],
      { closed: true, radius: s.ease },
    ),
  ];
};

/** Recording: a dot in the body and the lens flares wider. */
export const open = (h, s) => {
  const [x0, , x1] = s.keylines.wide;
  const body = 11.875;
  return [
    h.rect(x0, 4, body - x0, 10, s.box),
    dot(h, s, (x0 + body) / 2, 9),
    h.poly(
      [
        [body + 0.75, 7.25],
        [x1, 4],
        [x1, 14],
        [body + 0.75, 10.75],
      ],
      { closed: true, radius: s.ease },
    ),
  ];
};
