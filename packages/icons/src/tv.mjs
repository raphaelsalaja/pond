import dot from "./parts/dot.mjs";

const set = ({ poly, rect }, s) => {
  const [x0, , x1] = s.keylines.wide;
  const [top, bottom] = [5.25, 15.25];
  return [
    rect(x0, top, x1 - x0, bottom - top, s.box),
    poly(
      [
        [6.25, 2.375],
        [9, top],
        [11.75, 2.375],
      ],
      { radius: s.ease },
    ),
  ];
};

export default (h, s) => set(h, s);

/** On air: a signal rises from the screen. */
export const open = (h, s) => [set(h, s), h.arc(9, 12, 3.25, 225, 315), dot(h, s, 9, 12)];
