const [left, right, teeth, depth] = [4, 14, 4, 1.25];

const zigzag = (bottom) => {
  const step = (right - left) / teeth;
  return Array.from({ length: teeth * 2 + 1 }, (_, i) => [right - (i * step) / 2, i % 2 ? bottom : bottom - depth]);
};

export default ({ poly }, s) => {
  const [, y0, , y1] = s.keylines.square;
  return [
    poly([[left, y0], [right, y0], ...zigzag(y1)], {
      closed: true,
      radius: s.ease,
      corners: { 0: s.box, 1: s.box },
    }),
    "M 6.75 6.25 H 11.25",
    "M 6.75 9.5 H 11.25",
  ];
};

/** Open, the receipt prints out of its slot. */
export const open = ({ poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const slot = 3;
  return [
    rect(x0, y0, x1 - x0, slot, slot / 2),
    poly([[right, y0 + slot], ...zigzag(y1), [left, y0 + slot]], { radius: s.ease }),
    "M 6.75 8.75 H 11.25",
    "M 6.75 11.25 H 11.25",
  ];
};
