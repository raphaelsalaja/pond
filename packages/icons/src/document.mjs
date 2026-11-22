export default ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.tall;
  return [rect(x0, y0, x1 - x0, y1 - y0, s.box), "M 6.375 6.25 H 11.625", "M 6.375 9 H 11.625", "M 6.375 11.75 H 9.625"];
};
