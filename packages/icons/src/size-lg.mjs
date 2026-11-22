/** Four corners inside the window mark the fit. */
export default ({ poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const [near, far] = [5.875, 12.125];
  const arm = 2;
  const corner = (x, y, dx, dy) =>
    poly(
      [
        [x, y + dy * arm],
        [x, y],
        [x + dx * arm, y],
      ],
      { corners: { 1: s.ease } },
    );
  return [
    rect(x0, y0, x1 - x0, y1 - y0, s.box),
    corner(near, near, 1, 1),
    corner(far, near, -1, 1),
    corner(far, far, -1, -1),
    corner(near, far, 1, -1),
  ];
};
