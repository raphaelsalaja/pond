/** The binding rings cross the top edge. */
export default ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.tall;
  const top = 3.875;
  return [
    rect(x0, top, x1 - x0, y1 - top, s.box),
    [6, 9, 12].map((x) => `M ${x} ${y0} V ${top + 1.5}`),
    "M 6.375 9 H 11.625",
    "M 6.375 12 H 9.625",
  ];
};
