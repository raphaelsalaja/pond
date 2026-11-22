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

/** The picture lifts out of its frame; the frame drops to an open tray below it. */
export const open = (h, s) => {
  const [x0, , x1, y1] = s.keylines.wide;
  const [top, base] = [2.375, 12.25];
  const [l, r] = [5.25, 12.75];
  return [
    h.poly(
      [
        [x0, 8.5],
        [x0, y1],
        [x1, y1],
        [x1, 8.5],
      ],
      { corners: { 1: s.box, 2: s.box } },
    ),
    h.rect(l, top, r - l, base - top, s.box),
    h.poly(
      [
        [l, 10.25],
        [7.5, 8],
        [11.75, base],
      ],
      { radius: s.ease },
    ),
    dot(h, s, 9.75, 5.5),
  ];
};
