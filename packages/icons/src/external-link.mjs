import { arrow } from "./parts/arrows-head.mjs";

export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  return [
    poly(
      [
        [7.25, y0],
        [x0, y0],
        [x0, y1],
        [x1, y1],
        [x1, 10.75],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.box } },
    ),
    arrow(s, [8.375, 9.625], [x1, y0], true),
  ];
};
