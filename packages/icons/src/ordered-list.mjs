import { one, two } from "./parts/text-letter.mjs";
import { left, line, marker, right, rows, text } from "./parts/text-lines.mjs";

export default () => {
  const box = (t) => ({ x0: marker.x0, x1: marker.x1, t, b: t + marker.tall });
  return [
    one(box(left), false),
    line(rows[0], text, right),
    two(box(right - marker.tall)),
    line(rows[2], text, right),
  ];
};
