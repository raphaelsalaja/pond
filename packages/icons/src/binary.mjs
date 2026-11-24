import { one } from "./parts/text-letter.mjs";

/** A 2×2 of ones and zeros, each digit 3.75 wide and 5 tall. */
export default ({ rect }) => {
  const cols = [3.375, 10.875];
  const rows = [2.875, 10.125];
  const w = 3.75;
  const h = 5;
  const zero = (x, y) => rect(x, y, w, h, w / 2);
  const unit = (x, y) => one({ x0: x, x1: x + w, t: y, b: y + h }, false);
  return [
    unit(cols[0], rows[0]),
    zero(cols[1], rows[0]),
    zero(cols[0], rows[1]),
    unit(cols[1], rows[1]),
  ];
};
