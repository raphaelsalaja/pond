import dot from "./parts/dot.mjs";
import { move } from "./parts/objB-pose.mjs";

const shoulders = ({ keylines }) => {
  const [x0, , x1, y1] = keylines.square;
  return `M ${x0 + 1.5} ${y1} A ${(x1 - x0 - 3) / 2} 4.5 0 0 1 ${x1 - 1.5} ${y1} Z`;
};

export default ({ circle }, s) => [circle(9, 5.75, 3), shoulders(s)];

/** Active, the person steps left for a presence dot clear of the head. */
export const open = (h, s) => [move([h.circle(9, 5.75, 3), shoulders(s)], -1, 0), dot(h, s, 14.25, 3.75)];
