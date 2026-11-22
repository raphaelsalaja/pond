export default ({ circle, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  return [rect(x0, y0, x1 - x0, y1 - y0, s.box), circle(9, 7.375, 2), "M 5.75 12.375 H 12.25"];
};

/** The body shortens to the slot and a print slides out beneath it. */
export const open = ({ circle, poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const slot = 12.375;
  return [
    rect(x0, y0, x1 - x0, slot - y0, s.box),
    circle(9, 7.375, 2),
    poly(
      [
        [5.25, slot],
        [5.25, y1],
        [12.75, y1],
        [12.75, slot],
      ],
      { corners: { 1: s.ease, 2: s.ease } },
    ),
  ];
};
