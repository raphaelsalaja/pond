/** The tray dips below the rim. */
export default ({ poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  const rim = 10;
  const dip = 12;
  return [
    rect(x0, y0, x1 - x0, y1 - y0, s.box),
    poly(
      [
        [x0, rim],
        [5.625, rim],
        [6.625, dip],
        [11.375, dip],
        [12.375, rim],
        [x1, rim],
      ],
      { radius: s.ease },
    ),
  ];
};

/** A sheet rises out of the tray, its sides landing on the flat of the rim. */
export const open = ({ poly }, s) => {
  const [x0, , x1, y1] = s.keylines.wide;
  const top = 2.375;
  const rim = 10;
  const dip = 12;
  return [
    poly(
      [
        [x0, rim],
        [5.625, rim],
        [6.625, dip],
        [11.375, dip],
        [12.375, rim],
        [x1, rim],
        [x1, y1],
        [x0, y1],
      ],
      {
        closed: true,
        radius: s.ease,
        corners: { 0: s.box, 5: s.box, 6: s.box, 7: s.box },
      },
    ),
    poly(
      [
        [4.625, rim],
        [4.625, top],
        [13.375, top],
        [13.375, rim],
      ],
      { corners: { 1: s.ease, 2: s.ease } },
    ),
    "M 7.25 5.5 H 10.75",
  ];
};
