import { head } from "./parts/arrows-head.mjs";

export default ({ poly }, s) => {
  const [x0, , x1] = s.keylines.glyph;
  const [, y0] = s.keylines.square;
  const y = 11.75;
  return [
    poly(
      [
        [x1, y0],
        [x1, y],
        [x0, y],
      ],
      { corners: { 1: 3.5 } },
    ),
    head(s, [x0, y], [-1, 0], true),
  ];
};
