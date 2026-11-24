/** The sheet's left edge curls into the top roll and runs down into the bottom roll; `r` is each roll's radius. */
const scroll = (s, r) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const e = 0.75;
  const left = x0 + 2 * r;
  const [cy, by, roll] = [y0 + r, y1 - r, y1 - 2 * r];
  return [
    `M ${left} ${y0 + 2 * r} H ${x0 + e} A ${e} ${e} 0 0 1 ${x0} ${y0 + 2 * r - e} V ${cy} A ${r} ${r} 0 0 1 ${left} ${cy} V ${by} A ${r} ${r} 0 0 0 ${left + 2 * r} ${by} V ${roll + e} A ${e} ${e} 0 0 1 ${left + 2 * r + e} ${roll} H ${x1 - e} A ${e} ${e} 0 0 1 ${x1} ${roll + e} V ${by} A ${r} ${r} 0 0 1 ${x1 - r} ${y1} H ${left + r}`,
    `M 13.625 ${roll} V ${y0 + s.box} A ${s.box} ${s.box} 0 0 0 ${13.625 - s.box} ${y0} H ${x0 + r}`,
  ];
};

export default (h, s) => scroll(s, 2);

export const open = (h, s) => [scroll(s, 1.5), "M 7.75 6.5 H 11.25 M 7.75 9 H 11.25"];
