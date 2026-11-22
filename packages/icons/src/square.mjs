export default ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  return rect(x0, y0, x1 - x0, y1 - y0, s.box);
};
