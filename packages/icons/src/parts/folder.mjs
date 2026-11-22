/** The folder on the wide keyline. A badge or glyph centres on `body`. */
export const tab = { end: 7, drop: 1.25 };

export const body = ({ keylines }) => {
  const [x0, y0, x1, y1] = keylines.wide;
  return { x0, x1, y0: y0 + tab.drop, y1, cx: (x0 + x1) / 2, cy: (y0 + tab.drop + y1) / 2 };
};

export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  return poly(
    [
      [x0, y0],
      [tab.end, y0],
      [tab.end + tab.drop, y0 + tab.drop],
      [x1, y0 + tab.drop],
      [x1, y1],
      [x0, y1],
    ],
    /** Box corners share one radius; the quarter rule would give the short tab side a smaller one. */
    { closed: true, corners: { 0: s.box, 1: s.ease, 2: s.ease, 3: s.box, 4: s.box, 5: s.box } },
  );
};
