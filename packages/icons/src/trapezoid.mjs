/** The acute base vertices sit outside the keyline so their rounded tips land on it. */
export default ({ poly }, s) => {
  const [x0, , x1] = s.keylines.square;
  const [top, bottom] = [4.25, 13.75];
  const half = (x1 - x0) / 2;
  const T = 3.5;
  let B = half;
  for (let i = 0; i < 8; i++) {
    B =
      half +
      s.box * (1 / Math.tan(Math.atan((bottom - top) / (B - T)) / 2) - 1);
  }
  return poly(
    [
      [9 - T, top],
      [9 + T, top],
      [9 + B, bottom],
      [9 - B, bottom],
    ],
    { closed: true, corners: { 0: s.box, 1: s.box, 2: s.box, 3: s.box } },
  );
};
