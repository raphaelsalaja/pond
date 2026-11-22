import dot from "./parts/dot.mjs";

/** The vertices sit past the grid so the rounded tips land on the square keyline. */
const shape = ({ poly }, s) => {
  const R = 6.625 + s.box * (Math.SQRT2 - 1);
  return poly(
    [
      [9, 9 - R],
      [9 + R, 9],
      [9, 9 + R],
      [9 - R, 9],
    ],
    { closed: true, corners: { 0: s.box, 1: s.box, 2: s.box, 3: s.box } },
  );
};

export default shape;

export const open = (h, s) => [shape(h, s), dot(h, s, 9, 9)];
