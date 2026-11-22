import ring from "./parts/ring.mjs";

/** Four blades: each runs from a corner of the inner square, past the next corner, out to the rim. */
export default (h, s) => {
  const [c, , r] = s.keylines.circle;
  const k = 2.25;
  const [lo, hi] = [c - k, c + k];
  const reach = h.snap(Math.sqrt(r * r - k * k));
  return [ring(h, s), `M ${lo} ${lo} H ${c + reach}`, `M ${hi} ${lo} V ${c + reach}`, `M ${hi} ${hi} H ${c - reach}`, `M ${lo} ${hi} V ${c - reach}`];
};
