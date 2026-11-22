/** Shifted right so the triangle's centroid, not its box, sits on the centre; sharp angles take a tighter radius. */
export default ({ poly }, s) =>
  poly(
    [
      [5.5, 3.25],
      [15, 9],
      [5.5, 14.75],
    ],
    { closed: true, corners: { 0: s.ease, 1: s.ease, 2: s.ease } },
  );
