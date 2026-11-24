import dot from "./parts/dot.mjs";
import plus from "./parts/plus.mjs";

const star = (cx, cy, r) => {
  const q = r * 0.26;
  return `M ${cx} ${cy - r} Q ${cx + q} ${cy - q} ${cx + r} ${cy} Q ${cx + q} ${cy + q} ${cx} ${cy + r} Q ${cx - q} ${cy + q} ${cx - r} ${cy} Q ${cx - q} ${cy - q} ${cx} ${cy - r} Z`;
};

const wand = "M 2.875 15.125 L 9.25 8.75";

export default (h, s) => [
  wand,
  star(12.5, 5.5, 3.125),
  dot(h, s, 5.5, 4.375, 0.875),
  dot(h, s, 13.625, 12.5, 0.875),
];

/** The specks flare into twinkles. */
export const open = () => [
  wand,
  star(12.5, 5.5, 3.125),
  plus(5.5, 4.375, 1.5),
  plus(13.625, 12.5, 1.5),
];
