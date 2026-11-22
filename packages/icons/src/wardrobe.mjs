const floor = 14.375;

export default ({ rect }, s) => {
  const [x0, y0, x1] = s.keylines.tall;
  return [
    rect(x0, y0, x1 - x0, floor - y0, s.box),
    `M 9 ${y0} V ${floor}`,
    "M 6.25 7 V 9.5 M 11.75 7 V 9.5",
    `M 5.25 ${floor} V 15.625 M 12.75 ${floor} V 15.625`,
  ];
};

/** The right door swings open on its hinge and shows the rail. */
export const open = ({ rect, poly }, s) => {
  const y0 = 2.375;
  const [l, r] = [2.375, 12.875];
  const mid = (l + r) / 2;
  return [
    rect(l, y0, r - l, floor - y0, s.box),
    `M ${mid} ${y0} V ${floor}`,
    "M 5.125 7 V 9.5",
    `M ${mid} 5.375 H ${r}`,
    poly(
      [
        [r, y0],
        [15.625, y0 + 1.5],
        [15.625, floor - 1.5],
        [r, floor],
      ],
      { radius: s.ease },
    ),
    `M 4.25 ${floor} V 15.625 M 11 ${floor} V 15.625`,
  ];
};
