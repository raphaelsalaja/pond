export default ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const lid = 6.75;
  return [rect(x0, y0, x1 - x0, y1 - y0, s.box), `M ${x0} ${lid} H ${x1}`, `M 9 ${y0} V ${lid}`];
};

export const open = ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const [l, r, lid] = [x0 + 1.5, x1 - 1.5, 8];
  return [
    poly(
      [
        [l, lid],
        [r, lid],
        [r, y1],
        [l, y1],
      ],
      { closed: true, corners: { 0: s.ease / 2, 1: s.ease / 2, 2: s.box, 3: s.box } },
    ),
    poly(
      [
        [l, lid],
        [x0, y0 + 1.5],
        [7.25, y0 + 1.5],
        [9, lid],
        [10.75, y0 + 1.5],
        [x1, y0 + 1.5],
        [r, lid],
      ],
      { radius: s.ease },
    ),
  ];
};
