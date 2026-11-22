/** A strip of three frames. */
export default ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  return [rect(x0, y0, x1 - x0, y1 - y0, s.box), `M 6.75 ${y0} V ${y1}`, `M 11.25 ${y0} V ${y1}`];
};
