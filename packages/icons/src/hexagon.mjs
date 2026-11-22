/** Pointy top; the vertices sit past the square keyline so the rounded tips land on it. */
export default ({ poly }, s) => {
  const R = 6.625 + s.box * (2 / Math.sqrt(3) - 1);
  const pts = Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + k * 60) * Math.PI) / 180;
    return [9 + R * Math.cos(a), 9 + R * Math.sin(a)];
  });
  return poly(pts, { closed: true, corners: Object.fromEntries(pts.map((_, i) => [i, s.box])) });
};
