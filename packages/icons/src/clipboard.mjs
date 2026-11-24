/** The board's top edge runs into the sides of the clip. */
export const board = ({ poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.tall;
  const [left, right, clip] = [6.5, 11.5, 3];
  const top = y0 + clip / 2;
  return [
    poly(
      [
        [left, top],
        [x0, top],
        [x0, y1],
        [x1, y1],
        [x1, top],
        [right, top],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.box, 4: s.box } },
    ),
    rect(left, y0, right - left, clip, s.ease),
  ];
};

export default (h, s) => board(h, s);

export const open = (h, s) => [
  board(h, s),
  "M 6.375 9.25 H 11.625",
  "M 6.375 12.25 H 9.625",
];
