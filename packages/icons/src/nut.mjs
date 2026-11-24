import dot from "./parts/dot.mjs";

/** Pointy top like the hexagon, with tighter corners so it reads machined; vertices sit past the keyline so the tips land on it. */
const hex = ({ poly }, s) => {
  const R = 6.625 + s.ease * (2 / Math.sqrt(3) - 1);
  const pts = Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + k * 60) * Math.PI) / 180;
    return [9 + R * Math.cos(a), 9 + R * Math.sin(a)];
  });
  return poly(pts, { closed: true, corners: Object.fromEntries(pts.map((_, i) => [i, s.ease])) });
};

export default (h, s) => [hex(h, s), h.circle(9, 9, 2.5)];

export const open = (h, s) => [hex(h, s), dot(h, s, 9, 9)];
