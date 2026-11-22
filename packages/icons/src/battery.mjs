const cell = (rect, s) => {
  const [x0] = s.keylines.wide;
  return [rect(x0, 5.25, 10.75, 7.5, s.box), "M 15.625 7.625 V 10.375"];
};

export default ({ rect }, s) => cell(rect, s);

/** Charging: a level fills the cell. */
export const open = ({ rect }, s) => [cell(rect, s), "M 5.125 9 H 9.5"];
