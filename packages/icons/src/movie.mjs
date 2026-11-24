/** A clapperboard: two stripes slant across the top band. */
export default ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  const band = y0 + 3.5;
  const run = band - y0;
  return [
    rect(x0, y0, x1 - x0, y1 - y0, s.box),
    `M ${x0} ${band} H ${x1}`,
    ...[5, 10].map((x) => `M ${x} ${band} L ${x + run} ${y0}`),
  ];
};

/** The clapper lifts off the board. */
export const open = ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const strip = y0 + 3.25;
  const board = strip + 2.25;
  const run = strip - y0;
  return [
    rect(x0, y0, x1 - x0, strip - y0, s.ease),
    ...[5, 10].map((x) => `M ${x} ${strip} L ${x + run} ${y0}`),
    rect(x0, board, x1 - x0, y1 - board, s.box),
  ];
};
