const shoulders = ({ keylines }) => {
  const [x0, , x1, y1] = keylines.square;
  return `M ${x0 + 1.5} ${y1} A ${(x1 - x0 - 3) / 2} 4.5 0 0 1 ${x1 - 1.5} ${y1} Z`;
};

export default ({ circle }, s) => [circle(9, 5.75, 3), shoulders(s)];

/** The head tips aside and an arm rises from the right shoulder, clear of it. */
export const open = ({ circle }, s) => [circle(8.25, 5.375, 3), shoulders(s), "M 13.25 12.75 L 15 7.5"];
