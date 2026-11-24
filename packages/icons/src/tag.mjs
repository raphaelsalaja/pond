import dot from "./parts/dot.mjs";

/** A square corner top left, the body running to a flat tip bottom right, from a 21-unit drawing. */
export default (h, s) => {
  const [lo, , hi] = s.keylines.square;
  const map = ([x, y]) => [
    lo + ((x - 2) * (hi - lo)) / 21,
    lo + ((y - 2) * (hi - lo)) / 21,
  ];
  const pts = [
    [2, 2],
    [12, 2],
    [23, 13],
    [13, 23],
    [2, 12],
  ].map(map);
  const [hx, hy] = map([7.25, 7.25]);
  return [
    h.poly(pts, {
      closed: true,
      radius: s.radius,
      corners: { 2: 2.25, 3: 2.25 },
    }),
    dot(h, s, hx, hy),
  ];
};
