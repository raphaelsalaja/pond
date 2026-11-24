import dot from "./parts/dot.mjs";
import slash from "./parts/slash.mjs";

/** `tag.mjs` mirrored so the slash crosses its body, not its hole; the outline stops a stroke and a gap either side of the slash. */
export default (h, s) => {
  const [lo, , hi] = s.keylines.square;
  const map = ([x, y]) => [
    18 - (lo + ((x - 2) * (hi - lo)) / 21),
    lo + ((y - 2) * (hi - lo)) / 21,
  ];
  const [corner, back, tip, toe, heel] = [
    [2, 2],
    [12, 2],
    [23, 13],
    [13, 23],
    [2, 12],
  ].map(map);
  /** Where the side `a`→`b` (x + y constant) sits `k` across the slash line x = y. */
  const k = (s.stroke + 1) * Math.SQRT2;
  const across = (a, sign) => {
    const sum = a[0] + a[1];
    return [h.snap((sum + sign * k) / 2), h.snap((sum - sign * k) / 2)];
  };
  /** The full tag rounds these corners at a quarter of its 6.31 sides. */
  const round = 1.578;
  return [
    h.poly([across(toe, 1), heel, corner, back, across(back, 1)], {
      corners: { 1: round, 2: round, 3: round },
    }),
    h.poly([across(back, -1), tip, toe, across(toe, -1)], {
      corners: { 1: 2.25, 2: 2.25 },
    }),
    dot(h, s, ...map([7.25, 7.25])),
    slash(s),
  ];
};
