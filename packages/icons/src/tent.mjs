const ground = 15.375;

/** The poles cross above the ridge, continuing the tent's sides. */
const tent = ({ poly }, s) => [
  poly(
    [
      [9, 4.25],
      [15.625, ground],
      [2.375, ground],
    ],
    { closed: true, corners: { 0: 0, 1: s.ease, 2: s.ease } },
  ),
  "M 7.875 2.375 L 9 4.25 L 10.125 2.375",
];

export default (h, s) => [tent(h, s), `M 9 9.5 V ${ground}`];

/** The door flaps open. */
export const open = (h, s) => [
  tent(h, s),
  h.poly(
    [
      [6.25, ground],
      [9, 9.25],
      [11.75, ground],
    ],
    { corners: { 1: 0.75 } },
  ),
];
