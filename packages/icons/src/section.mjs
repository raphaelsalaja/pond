/** A heading rule above a box. */
export default ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const box = 6.375;
  return [`M ${x0} ${y0} H ${x0 + 5}`, rect(x0, box, x1 - x0, y1 - box, s.box)];
};
