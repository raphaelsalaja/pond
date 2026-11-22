import { arrow, sizes } from "./parts/arrows-head.mjs";

export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const top = 8.625;
  const reach = 9 - sizes.small;
  return [
    poly(
      [
        [reach, top],
        [x0, top],
        [x0, y1],
        [x1, y1],
        [x1, top],
        [18 - reach, top],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.box, 4: s.box } },
    ),
    arrow(s, [9, 11.875], [9, y0], true),
  ];
};
