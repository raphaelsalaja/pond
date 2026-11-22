import { a, A, base, top } from "./parts/text-letter.mjs";

const [left, right] = [2.375, 15.375];

export default () => [A(left, 8.625, top, base), a(right, 2.375, base)];

/** The pair lifts onto a baseline rule. */
export const open = (h, s) => {
  const lift = 12.375;
  return [A(left, 8.375, 2.875, lift), a(right, 2.125, lift), `M ${s.keylines.square[0]} ${s.keylines.square[3]} H ${s.keylines.square[2]}`];
};
