export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const tip = 10.75;
  return [
    `M 9 ${y0} V ${tip}`,
    poly(
      [
        [5.5, tip - 3.5],
        [9, tip],
        [12.5, tip - 3.5],
      ],
      { radius: s.ease },
    ),
    poly(
      [
        [x0, 11.25],
        [x0, y1],
        [x1, y1],
        [x1, 11.25],
      ],
      { corners: { 1: s.box, 2: s.box } },
    ),
  ];
};

/** The arrow drops 1.75 into the tray, keeping its length. */
export const open = ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const tip = 12.5;
  return [
    `M 9 ${y0 + 1.75} V ${tip}`,
    poly(
      [
        [5.5, tip - 3.5],
        [9, tip],
        [12.5, tip - 3.5],
      ],
      { radius: s.ease },
    ),
    poly(
      [
        [x0, 11.25],
        [x0, y1],
        [x1, y1],
        [x1, 11.25],
      ],
      { corners: { 1: s.box, 2: s.box } },
    ),
  ];
};
