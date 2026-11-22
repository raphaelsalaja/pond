/** Open, the top drawer's front comes forward, wider than the cabinet. */
export default ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.tall;
  const mid = 9;
  return [
    rect(x0, y0, x1 - x0, y1 - y0, s.box),
    `M ${x0} ${mid} H ${x1}`,
    "M 7.25 5.625 H 10.75",
    "M 7.25 12.375 H 10.75",
  ];
};

export const open = ({ poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.tall;
  const [front, back] = [s.keylines.wide[0], s.keylines.wide[2]];
  const [top, bottom] = [5.5, 10.25];
  return [
    poly(
      [
        [x0, top],
        [x0, y0],
        [x1, y0],
        [x1, top],
      ],
      { corners: { 1: s.box, 2: s.box } },
    ),
    rect(front, top, back - front, bottom - top, s.ease),
    poly(
      [
        [x0, bottom],
        [x0, y1],
        [x1, y1],
        [x1, bottom],
      ],
      { corners: { 1: s.box, 2: s.box } },
    ),
    "M 7.25 7.875 H 10.75",
    "M 7.25 13 H 10.75",
  ];
};
