const set = ({ rect }, s) => {
  const [x0, , x1, y1] = s.keylines.square;
  const top = 10;
  const w = 3.5;
  return [
    `M ${x0} ${top + 1} V 9 A 6.625 6.625 0 0 1 ${x1} 9 V ${top + 1}`,
    rect(x0, top, w, y1 - top, s.ease),
    rect(x1 - w, top, w, y1 - top, s.ease),
  ];
};

export default set;

/** Playing: a second band of sound under the headband. */
export const open = (h, s) => [set(h, s), h.arc(9, 9, 3.5, 205, 335)];
