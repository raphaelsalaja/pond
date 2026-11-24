export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  const [a, b] = [6.75, 11.25];
  const drop = 1.25;
  return [
    poly(
      [
        [x0, y0 + drop],
        [a, y0],
        [b, y0 + drop],
        [x1, y0],
        [x1, y1 - drop],
        [b, y1],
        [a, y1 - drop],
        [x0, y1],
      ],
      {
        closed: true,
        corners: {
          0: s.ease,
          1: s.ease,
          2: s.ease,
          3: s.ease,
          4: s.ease,
          5: s.ease,
          6: s.ease,
          7: s.ease,
        },
      },
    ),
    `M ${a} ${y0} V ${y1 - drop}`,
    `M ${b} ${y0 + drop} V ${y1}`,
  ];
};

/** Unfolded flat, a pin marking the spot. */
export const open = ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  const [cx, cy, r, tip] = [9, 8.125, 2, 12];
  return [
    rect(x0, y0, x1 - x0, y1 - y0, s.box),
    `M ${cx} ${tip} C ${cx - 0.75} ${tip - 0.75} ${cx - r} ${cy + 1.75} ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} C ${cx + r} ${cy + 1.75} ${cx + 0.75} ${tip - 0.75} ${cx} ${tip} Z`,
  ];
};
