import { arc, cubic, cut, line, near } from "./parts/system-cut.mjs";

const shield = (s) => {
  const [x0, y0, x1, y1] = s.keylines.tall;
  const b = s.box;
  const shoulder = 8;
  return [
    line([x0, shoulder], [x0, y0 + b]),
    arc([x0 + b, y0 + b], b, b, Math.PI, Math.PI / 2),
    line([x0 + b, y0], [x1 - b, y0]),
    arc([x1 - b, y0 + b], b, b, -Math.PI / 2, Math.PI / 2),
    line([x1, y0 + b], [x1, shoulder]),
    cubic([x1, shoulder], [x1, 11.75], [12, 14.5], [9, y1]),
    cubic([9, y1], [6, 14.5], [x0, 11.75], [x0, shoulder]),
  ];
};

export default ({ poly }, s) => [
  cut(shield(s), []),
  poly(
    [
      [6.5, 8.75],
      [8.25, 10.5],
      [11.5, 7.25],
    ],
    { radius: s.ease },
  ),
];

/** Verified: the check grows and breaks out through the shield's corner. */
export const open = ({ poly }, s) => {
  const check = [
    [5.875, 9],
    [8.125, 11.25],
    [15.25, 4.125],
  ];
  return [
    cut(shield(s), [near(check[1], check[2], s.stroke + 1)]),
    poly(check, { radius: s.ease }),
  ];
};
