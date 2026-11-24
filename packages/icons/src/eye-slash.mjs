import slash from "./parts/slash.mjs";

const side = (p) => (p[0] - p[1]) / Math.SQRT2;

/** `eye.mjs` cut where the slash crosses it; the pupil would sit in the cut, so it goes. */
export default (h, s) => {
  const [x0, , x1] = s.keylines.wide;
  const gap = s.stroke + 1;
  const curve = (p0, c, p2) => {
    const at = (t) =>
      [0, 1].map(
        (i) => (1 - t) ** 2 * p0[i] + 2 * t * (1 - t) * c[i] + t * t * p2[i],
      );
    const tangent = (t) =>
      [0, 1].map((i) => 2 * (1 - t) * (c[i] - p0[i]) + 2 * t * (p2[i] - c[i]));
    const solve = (target) => {
      let [lo, hi] = [0, 1];
      const rising = side(at(1)) > side(at(0));
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (side(at(mid)) < target === rising) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return lo;
    };
    const piece = (a, b) => {
      const start = at(a);
      const d = tangent(a);
      const ctrl = [
        start[0] + ((b - a) * d[0]) / 2,
        start[1] + ((b - a) * d[1]) / 2,
      ];
      return `M ${h.pt(start)} Q ${h.pt(ctrl)} ${h.pt(at(b))}`;
    };
    const [ta, tb] = [solve(-gap), solve(gap)].sort((m, n) => m - n);
    return [piece(0, ta), piece(tb, 1)];
  };
  return [
    curve([x0, 9], [9, 1.5], [x1, 9]),
    curve([x1, 9], [9, 16.5], [x0, 9]),
    slash(s),
  ];
};
