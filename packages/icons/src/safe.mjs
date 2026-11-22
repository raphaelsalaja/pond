import dot from "./parts/dot.mjs";

const base = 14.125;

export default ({ rect, circle }, s) => {
  const [x0, y0, x1] = s.keylines.square;
  return [
    rect(x0, y0, x1 - x0, base - y0, s.box),
    circle(7.75, 8.25, 2.5),
    "M 12.5 6.875 V 9.625",
    `M 5 ${base} V 15.625 M 13 ${base} V 15.625`,
  ];
};

/** The door swings out on the left hinge, seen edge-on in perspective; the body shifts right to make room. */
export const open = (h, s) => {
  const [x0, y0, x1] = s.keylines.square;
  const hinge = 7.375;
  const mid = (y0 + base) / 2;
  return [
    h.poly(
      [
        [hinge, y0],
        [x1, y0],
        [x1, base],
        [hinge, base],
      ],
      { closed: true, corners: { 0: s.ease / 2, 1: s.box, 2: s.box, 3: s.ease / 2 } },
    ),
    h.poly(
      [
        [hinge, y0],
        [x0, 3.875],
        [x0, 12.625],
        [hinge, base],
      ],
      { radius: s.ease },
    ),
    dot(h, s, 4.875, mid),
    `M 9.625 ${mid} H 13.375`,
    `M 9.125 ${base} V 15.625 M 13.375 ${base} V 15.625`,
  ];
};
