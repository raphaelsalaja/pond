/** Two pins per side; the die keeps a full detail gap from the body. */
const body = ({ rect }, s) => {
  const [lo, , hi] = s.keylines.square;
  const [b0, b1] = [4.625, 13.375];
  const pins = [7.25, 10.75].flatMap((p) => [
    `M ${p} ${lo} V ${b0}`,
    `M ${p} ${b1} V ${hi}`,
    `M ${lo} ${p} H ${b0}`,
    `M ${b1} ${p} H ${hi}`,
  ]);
  return [rect(b0, b0, b1 - b0, b1 - b0, s.ease), ...pins];
};

export default (h, s) => [body(h, s), h.rect(7.375, 7.375, 3.25, 3.25, 0.75)];

/** The die lights up as a spark. */
export const open = (h, s) => {
  const [c, r, q] = [9, 2.125, 0.5];
  return [
    body(h, s),
    `M ${c} ${c - r} Q ${c + q} ${c - q} ${c + r} ${c} Q ${c + q} ${c + q} ${c} ${c + r} Q ${c - q} ${c + q} ${c - r} ${c} Q ${c - q} ${c - q} ${c} ${c - r} Z`,
  ];
};
