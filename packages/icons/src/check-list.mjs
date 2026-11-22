import dot from "./parts/dot.mjs";
import { left, line, marker, right, rows, text } from "./parts/text-lines.mjs";

const check = (poly, s, y) =>
  poly(
    [
      [marker.x0, y],
      [marker.x0 + 1.375, y + 1.375],
      [marker.x1 + 0.25, y - 1.625],
    ],
    { radius: s.ease },
  );

export default (h, s) => [
  check(h.poly, s, rows[0]),
  line(rows[0], text, right),
  dot(h, s, left + 1.875, rows[2], 1),
  line(rows[2], text, right),
];

export const open = (h, s) => [check(h.poly, s, rows[0]), line(rows[0], text, right), check(h.poly, s, rows[2]), line(rows[2], text, right)];
