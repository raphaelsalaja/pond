import badge, { edge } from "./parts/badge.mjs";

export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  return [
    poly(
      [
        [edge(y1), y1],
        [x0, y1],
        [x0, y0],
        [x1, y0],
        [x1, edge(x1)],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.box } },
    ),
    badge("pen"),
  ];
};
