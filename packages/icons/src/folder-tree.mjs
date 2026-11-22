/** A trunk on the left branches into two small folders. */
export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const left = 7.375;
  const tall = 5;
  const small = (top) =>
    poly(
      [
        [left, top],
        [left + 3.25, top],
        [left + 4.25, top + 1],
        [x1, top + 1],
        [x1, top + tall],
        [left, top + tall],
      ],
      { closed: true, corners: { 0: s.ease, 1: s.ease / 2, 2: s.ease / 2, 3: s.ease, 4: s.ease, 5: s.ease } },
    );
  const lower = y1 - tall;
  const mid = (top) => top + (tall + 1) / 2;
  const trunk = 3.875;
  return [
    small(y0),
    small(lower),
    poly(
      [
        [trunk, y0],
        [trunk, mid(lower)],
        [left, mid(lower)],
      ],
      { corners: { 1: s.box } },
    ),
    `M ${trunk} ${mid(y0)} H ${left}`,
  ];
};
