/** The acute vertices sit outside the keyline so their rounded tips land on it. */
export default ({ poly }, s) => {
  const [x0, , x1] = s.keylines.square;
  const [top, bottom] = [4.5, 13.5];
  const slant = 4;
  const e = s.box * (1 / Math.tan(Math.atan((bottom - top) / slant) / 2) - 1);
  return poly(
    [
      [x0 - e + slant, top],
      [x1 + e, top],
      [x1 + e - slant, bottom],
      [x0 - e, bottom],
    ],
    { closed: true, corners: { 0: s.box, 1: s.box, 2: s.box, 3: s.box } },
  );
};
