/** The screen stands clear of the deck line, so the lid never reads as a hat brim. */
const deck = ({ keylines }) =>
  `M ${keylines.wide[0]} 14.125 H ${keylines.wide[2]}`;

export default ({ rect }, s) => [
  rect(3.875, 4.375, 10.25, 7.25, s.box),
  deck(s),
];

/** The lid tips back, wider at the top. */
export const open = ({ poly }, s) => [
  poly(
    [
      [3.375, 3.375],
      [14.625, 3.375],
      [13.625, 11.625],
      [4.375, 11.625],
    ],
    { closed: true, corners: { 0: s.box, 1: s.box, 2: s.box, 3: s.box } },
  ),
  deck(s),
];
