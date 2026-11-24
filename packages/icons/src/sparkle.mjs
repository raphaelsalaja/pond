import sparkle from "./sparkle.mjs";

/** Four points with concave sides, pulled 0.5 in from the square keyline so it weighs like a filled shape. */
export default () =>
  "M 9 2.875 Q 9.75 8.25 15.125 9 Q 9.75 9.75 9 15.125 Q 8.25 9.75 2.875 9 Q 8.25 8.25 9 2.875 Z";

/** A small solid twinkle fills the empty top right corner. */
export const open = (h, s) => {
  const [x, y, a, q] = [13.75, 4.25, 1.875, 0.375];
  return [
    sparkle(h, s),
    {
      solid: true,
      d: `M ${x} ${y - a} Q ${x + q} ${y - q} ${x + a} ${y} Q ${x + q} ${y + q} ${x} ${y + a} Q ${x - q} ${y + q} ${x - a} ${y} Q ${x - q} ${y - q} ${x} ${y - a} Z`,
    },
  ];
};
