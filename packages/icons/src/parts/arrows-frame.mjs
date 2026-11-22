import { poly } from "../../helpers.mjs";

/** Four corner brackets on the square keyline, each `arm` long. */
export const corners = (s, arm) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const bracket = (cx, cy, sx, sy) =>
    poly(
      [
        [cx, cy + sy * arm],
        [cx, cy],
        [cx + sx * arm, cy],
      ],
      { corners: { 1: s.box } },
    );
  return [bracket(x0, y0, 1, 1), bracket(x1, y0, -1, 1), bracket(x1, y1, -1, -1), bracket(x0, y1, 1, -1)];
};

/** Two half frames either side of the mirror line; `turn` lays it on its side. */
export const flip = (s, turn = false) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  const reach = 3.375;
  const map = turn ? ([x, y]) => [y, x] : (p) => p;
  const side = (x, sx) =>
    poly(
      [
        [x + sx * reach, y0],
        [x, y0],
        [x, y1],
        [x + sx * reach, y1],
      ].map(map),
      { corners: { 1: s.box, 2: s.box } },
    );
  const [a, b] = [map([9, 2.375]), map([9, 15.625])];
  return [side(x0, 1), side(x1, -1), `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`];
};
