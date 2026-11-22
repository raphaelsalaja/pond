const mast = 8;
const boom = 9.625;
const deck = 12.25;

const hull = ({ poly }, s) => {
  const [x0, , x1] = s.keylines.square;
  return poly(
    [
      [x0, deck],
      [x1, deck],
      [13.125, 15.375],
      [4.875, 15.375],
    ],
    { closed: true, corners: { 0: 0.75, 1: 0.75, 2: s.ease, 3: s.ease } },
  );
};

export default (h, s) => [
  hull(h, s),
  `M ${mast} ${deck} V 2.375`,
  h.poly(
    [
      [mast, 2.375],
      [14.25, boom],
      [mast, boom],
    ],
    { radius: s.ease },
  ),
];

/** Both sails fill with wind. */
export const open = (h, s) => [
  hull(h, s),
  `M ${mast} ${deck} V 2.375`,
  `M ${mast} 2.375 A 8.5 8.5 0 0 1 14.625 ${boom} H 3.375 A 7 7 0 0 1 ${mast} 4.375`,
];
