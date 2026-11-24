import { arrow } from "./parts/arrows-head.mjs";

export default (_h, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const [a, b] = [6.75, 11.25];
  return [
    arrow(s, [a, a], [x0, y0], true),
    arrow(s, [b, a], [x1, y0], true),
    arrow(s, [b, b], [x1, y1], true),
    arrow(s, [a, b], [x0, y1], true),
  ];
};
