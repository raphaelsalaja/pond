import dot from "./parts/dot.mjs";

const box = (rect, s) => {
  const [, y0, , y1] = s.keylines.tall;
  return rect(4.375, y0, 9.25, y1 - y0, s.box);
};

export default (h, s) => [box(h.rect, s), dot(h, s, 9, 5.5, 1), h.circle(9, 10.75, 2)];

/** Playing: the cones push out. */
export const open = (h, s) => [box(h.rect, s), dot(h, s, 9, 5.375, s.dot), h.circle(9, 10.875, 2.5)];
