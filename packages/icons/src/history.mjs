/** The clock's rim runs counterclockwise to an axis-aligned head at its upper left. */
export default ({ arc, poly, snap }, s) => {
  const r = 6.375;
  const end = -135;
  const px = snap(9 + r * Math.cos((end * Math.PI) / 180));
  const py = snap(9 + r * Math.sin((end * Math.PI) / 180));
  const arm = 2;
  return [
    arc(9, 9, r, 180, end),
    poly(
      [
        [px, py - arm],
        [px, py],
        [px + arm, py],
      ],
      { radius: s.ease / 2 },
    ),
    poly(
      [
        [9, 5.75],
        [9, 9],
        [11.5, 10.5],
      ],
      { radius: s.ease },
    ),
  ];
};
