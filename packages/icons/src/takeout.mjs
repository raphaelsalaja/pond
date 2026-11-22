const lid = 8.5;
const ridge = 5.875;

/** The pail flares to its top, wider than its foot. */
const pail = ({ poly }, s) =>
  poly(
    [
      [3.375, lid],
      [14.625, lid],
      [12.625, 15.625],
      [5.375, 15.625],
    ],
    { closed: true, corners: { 0: s.ease / 2, 1: s.ease / 2, 2: s.box, 3: s.box } },
  );

/** The folded top narrows to a flat ridge, split by the seam where the flaps meet; the wire loops above. */
export default (h, s) => [
  pail(h, s),
  h.poly(
    [
      [3.375, lid],
      [5.375, ridge],
      [12.625, ridge],
      [14.625, lid],
    ],
    { corners: { 1: s.ease / 2, 2: s.ease / 2 } },
  ),
  `M 9 ${ridge} V ${lid}`,
  `M 6.625 ${ridge} A 2.375 3.5 0 0 1 11.375 ${ridge}`,
];

/** The flaps fold out to the sides and the wire stands up. */
export const open = (h, s) => [
  pail(h, s),
  h.poly(
    [
      [3.375, lid],
      [2.375, 5.125],
      [5.625, lid],
    ],
    { radius: s.ease },
  ),
  h.poly(
    [
      [14.625, lid],
      [15.625, 5.125],
      [12.375, lid],
    ],
    { radius: s.ease },
  ),
  `M 7.25 ${lid} V 4.375 A 1.75 1.75 0 0 1 10.75 4.375 V ${lid}`,
];
