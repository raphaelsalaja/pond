const wallet = ({ rect, poly }, s, top) => {
  const [x0, , x1, y1] = s.keylines.wide;
  const mid = (top + y1) / 2;
  return [
    rect(x0, top, x1 - x0, y1 - top, s.box),
    poly(
      [
        [x1, mid - 2.125],
        [12, mid - 2.125],
        [12, mid + 2.125],
        [x1, mid + 2.125],
      ],
      { radius: s.ease },
    ),
  ];
};

export default (h, s) => wallet(h, s, s.keylines.wide[1]);

/** A card slides up out of the wallet. */
export const open = (h, s) => [
  wallet(h, s, 6.375),
  h.poly(
    [
      [4.75, 6.375],
      [4.75, 3.375],
      [12.25, 3.375],
      [12.25, 6.375],
    ],
    { radius: s.ease },
  ),
];
