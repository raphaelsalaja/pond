import ring from "./parts/ring.mjs";

/** The dark half is filled and stroked so its corners round; it sits a gap inside the ring. */
export default (h, s) => {
  const [c] = s.keylines.circle;
  const r = 3.875;
  return [ring(h, s), { d: `M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r} Z`, fill: true }];
};
