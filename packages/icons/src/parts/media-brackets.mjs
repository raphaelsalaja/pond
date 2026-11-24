import { poly } from "../../helpers.mjs";

/** Four viewfinder corners on the square keyline, each `arm` long from its corner. */
export default (s, arm = 3.375) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const corner = (x, y, dx, dy) =>
    poly(
      [
        [x, y + dy * arm],
        [x, y],
        [x + dx * arm, y],
      ],
      { corners: { 1: s.box } },
    );
  return [
    corner(x0, y0, 1, 1),
    corner(x1, y0, -1, 1),
    corner(x1, y1, -1, -1),
    corner(x0, y1, 1, -1),
  ];
};
