const handset = (rect, s, x) => {
  const [, y0, , y1] = s.keylines.square;
  return [rect(x, y0, 8, y1 - y0, s.box), `M ${x + 2.75} 12.875 H ${x + 5.25}`];
};

export default ({ rect }, s) => handset(rect, s, 5);

/** Ringing: the handset steps aside for a wave of sound. */
export const open = ({ arc, rect }, s) => [handset(rect, s, s.keylines.square[0]), arc(10.375, 9, 4, -40, 40)];
