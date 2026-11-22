import dot from "./parts/dot.mjs";

/** Two squares overlaid at 45° make eight soft points; the hole matches the six-tooth gear. */
const cog = ({ poly }, s) => {
  const R = 6.625 + s.ease * (Math.SQRT2 - 1);
  const ri = (R * Math.SQRT1_2) / Math.cos(Math.PI / 8);
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = ((-90 + i * 22.5) * Math.PI) / 180;
    const r = i % 2 ? ri : R;
    return [9 + r * Math.cos(a), 9 + r * Math.sin(a)];
  });
  const corners = Object.fromEntries(pts.map((_, i) => [i, i % 2 ? s.ease / 2 : s.ease]));
  return poly(pts, { closed: true, corners });
};

export default (h, s) => [cog(h, s), h.circle(9, 9, 2.25)];

export const open = (h, s) => [cog(h, s), dot(h, s, 9, 9)];
