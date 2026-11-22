import { indent, left, line, right, rows } from "./parts/text-lines.mjs";

export default () => [
  `M ${left + 1} ${rows[0] - 1.125} V ${rows[2] + 1.125}`,
  line(rows[0], indent, right),
  line(rows[1], indent, right),
  line(rows[2], indent, right - 3.5),
];
