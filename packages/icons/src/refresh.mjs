/** Two clockwise arcs chase each other; each head lands where its arms run on the axes. */
export default ({ arc, poly, snap }, s) => {
  const r = 6;
  const arm = 2.25;
  const head = (deg, sign) => {
    const x = snap(9 + r * Math.cos((deg * Math.PI) / 180));
    const y = snap(9 + r * Math.sin((deg * Math.PI) / 180));
    return poly(
      [
        [x, y - sign * arm],
        [x, y],
        [x - sign * arm, y],
      ],
      { radius: s.ease / 2 },
    );
  };
  return [arc(9, 9, r, 165, 315), head(315, 1), arc(9, 9, r, 345, 495), head(135, -1)];
};
