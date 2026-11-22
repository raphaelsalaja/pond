import ring from "./parts/ring.mjs";

const needle = (poly, s, deg) => {
  const a = (deg * Math.PI) / 180;
  const along = [Math.cos(a), Math.sin(a)];
  const across = [-along[1], along[0]];
  const p = (u, v) => [9 + along[0] * u + across[0] * v, 9 + along[1] * u + across[1] * v].map((x) => Math.round(x * 8) / 8);
  return poly([p(4.25, 0), p(0, 1.5), p(-4.25, 0), p(0, -1.5)], { closed: true, radius: s.ease });
};

export default (h, s) => [ring(h, s), needle(h.poly, s, -45)];

/** Searching: the needle swings round to north. */
export const open = (h, s) => [ring(h, s), needle(h.poly, s, -90)];
