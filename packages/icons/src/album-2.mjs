const cover = ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  return rect(x0, y0, x1 - x0, y1 - y0, s.box);
};

export default (h, s) => [cover(h, s), "M 6.5 6.875 H 11.5"];

/** Opened flat, the cover becomes a spread with the spine down the middle. */
export const open = (h, s) => {
  const [, y0, , y1] = s.keylines.wide;
  return [cover(h, s), `M 9 ${y0} V ${y1}`];
};
