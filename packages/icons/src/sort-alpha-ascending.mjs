import { arrow } from "./parts/arrows-head.mjs";

export default ({ poly }, s) => {
  const [x0, y0, , y1] = s.keylines.square;
  const [, gy0, , gy1] = s.keylines.glyph;
  const x1 = 6.125;
  const foot = 7.625;
  return [
    poly(
      [
        [x0, foot],
        [(x0 + x1) / 2, y0],
        [x1, foot],
      ],
      { radius: s.ease / 2 },
    ),
    "M 3 5.75 H 5.5",
    poly(
      [
        [x0, 10.375],
        [x1, 10.375],
        [x0, y1],
        [x1, y1],
      ],
      { corners: { 1: 0.625, 2: 0.625 } },
    ),
    arrow(s, [12.125, gy0], [12.125, gy1], true),
  ];
};
