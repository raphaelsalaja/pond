import ring from "./parts/ring.mjs";

export default (h, s) => {
  const [c] = s.keylines.circle;
  return [ring(h, s), h.circle(c, c, 3.25)];
};
