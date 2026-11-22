/** Folded, an inner page shows on the left; open, the front page spreads to full width. */
export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const [fold, inner] = [5.75, 7.25];
  return [
    poly(
      [
        [fold, y1],
        [fold, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, inner],
        [fold, inner],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.box, 4: s.box, 5: s.ease } },
    ),
    "M 8.5 5.75 H 12.75",
    "M 8.5 9 H 12.75",
    "M 8.5 12.25 H 10.75",
  ];
};

export const open = ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  return [
    rect(x0, y0, x1 - x0, y1 - y0, s.box),
    "M 5.75 5.75 H 12.25",
    "M 5.75 9 H 7.75",
    "M 5.75 12.25 H 7.75",
    "M 10.25 9 H 12.25",
    "M 10.25 12.25 H 12.25",
  ];
};
