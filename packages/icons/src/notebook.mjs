const rings = [5.5, 9, 12.5];

/** The spiral rings cross the spine. */
export default ({ rect }, s) => {
  const [, y0, x1, y1] = s.keylines.square;
  const spine = 4.875;
  return [
    rect(spine, y0, x1 - 0.5 - spine, y1 - y0, s.box),
    rings.map((y) => `M ${spine - 2} ${y} H ${spine + 2}`),
    "M 9.25 6 H 12.25",
  ];
};

export const open = ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const gap = 1.25;
  const page = (outer, inner) =>
    poly(
      [
        [inner, y0],
        [outer, y0],
        [outer, y1],
        [inner, y1],
      ],
      { closed: true, corners: { 0: s.ease, 1: s.box, 2: s.box, 3: s.ease } },
    );
  return [
    page(x0, 9 - gap),
    page(x1, 9 + gap),
    rings.map((y) => `M 6.75 ${y} H 11.25`),
  ];
};
