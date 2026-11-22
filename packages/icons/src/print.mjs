export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const [l, r] = [5.5, 12.5];
  const [top, bottom] = [6.5, 12.75];
  return [
    poly(
      [
        [l, top],
        [l, y0],
        [r, y0],
        [r, top],
      ],
      { radius: s.ease },
    ),
    poly(
      [
        [l, bottom],
        [x0, bottom],
        [x0, top],
        [x1, top],
        [x1, bottom],
        [r, bottom],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.box, 4: s.box } },
    ),
    poly(
      [
        [l, 10.25],
        [r, 10.25],
        [r, y1],
        [l, y1],
      ],
      { closed: true, corners: { 0: 0, 1: 0, 2: s.ease, 3: s.ease } },
    ),
  ];
};
