/** Equilateral; the vertices sit outside the grid so the rounded tips fill the square keyline. */
export const vertices = (s) => {
  const r = s.box;
  const [x0, , x1] = s.keylines.square;
  const base = 15.125;
  const half = (x1 - x0) / 2 + r * (Math.sqrt(3) - 1);
  const apex = base - half * Math.sqrt(3);
  return {
    r,
    points: [
      [9, apex],
      [9 + half, base],
      [9 - half, base],
    ],
  };
};

export default ({ poly }, s) => {
  const { r, points } = vertices(s);
  return poly(points, { closed: true, corners: { 0: r, 1: r, 2: r } });
};
