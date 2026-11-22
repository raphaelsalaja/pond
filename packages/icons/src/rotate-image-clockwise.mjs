import { head } from "./parts/arrows-head.mjs";

export default ({ poly, rect }, s) => {
  const [x0, y0, , y1] = s.keylines.square;
  const x = 12.125;
  const tip = 11.25;
  return [
    rect(x0, 9.375, 5.5, y1 - 9.375, s.box),
    poly(
      [
        [5.375, y0],
        [x, y0],
        [x, tip],
      ],
      { corners: { 1: 3.5 } },
    ),
    head(s, [x, tip], [0, 1], true),
  ];
};
