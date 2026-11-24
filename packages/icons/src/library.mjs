/** Saves as a stack of cards seen from the front. */
export default ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const top = y1 - 9;
  const mid = (y0 + top) / 2;
  return [
    rect(x0, top, x1 - x0, y1 - top, s.box),
    `M ${x0 + 1.75} ${mid} L ${x1 - 1.75} ${mid}`,
    `M ${x0 + 3.5} ${y0} L ${x1 - 3.5} ${y0}`,
  ];
};
