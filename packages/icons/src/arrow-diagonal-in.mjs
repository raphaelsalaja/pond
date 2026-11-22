import { arrow } from "./parts/arrows-head.mjs";

export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  return [
    poly(
      [
        [x0, 10.25],
        [x0, y1],
        [7.75, y1],
      ],
      { corners: { 1: s.box } },
    ),
    arrow(s, [x1, y0], [6.5, 11.5], true),
  ];
};
