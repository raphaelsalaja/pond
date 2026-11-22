/** The file on the tall keyline, its fold filled. A badge or glyph centres on `body`. */
export const fold = 4;

export const body = ({ keylines }) => {
  const [x0, y0, x1, y1] = keylines.tall;
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + fold + y1) / 2 };
};

export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.tall;
  const outline = poly(
    [
      [x0, y0],
      [x1 - fold, y0],
      [x1, y0 + fold],
      [x1, y1],
      [x0, y1],
    ],
    { closed: true, corners: { 0: s.box, 1: s.ease / 2, 2: s.ease / 2, 3: s.box, 4: s.box } },
  );
  const corner = poly(
    [
      [x1 - fold, y0],
      [x1 - fold, y0 + fold],
      [x1, y0 + fold],
    ],
    { radius: s.ease },
  );
  return [
    outline,
    { d: `${corner} Z`, fill: true },
  ];
};
