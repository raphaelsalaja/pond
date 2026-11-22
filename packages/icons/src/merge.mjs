import { arrow } from "./parts/arrows-head.mjs";

export default ({ poly }, s) => {
  const [, , x1] = s.keylines.glyph;
  const [x0] = s.keylines.square;
  const join = 9.5;
  const spread = 5.25;
  return [
    poly(
      [
        [x0, 9 - spread],
        [join - spread, 9 - spread],
        [join, 9],
        [join - spread, 9 + spread],
        [x0, 9 + spread],
      ],
      { radius: s.ease },
    ),
    arrow(s, [join, 9], [x1, 9], true),
  ];
};
