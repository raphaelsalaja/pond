/** A sticky note; its corner peels further when open. */
const note = ({ poly }, s, fold) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const corner = poly(
    [
      [x1, y1 - fold],
      [x1 - fold, y1 - fold],
      [x1 - fold, y1],
    ],
    { radius: s.ease },
  );
  return [
    poly(
      [
        [x0, y0],
        [x1, y0],
        [x1, y1 - fold],
        [x1 - fold, y1],
        [x0, y1],
      ],
      { closed: true, corners: { 0: s.box, 1: s.box, 2: s.ease / 2, 3: s.ease / 2, 4: s.box } },
    ),
    { d: `${corner} Z`, fill: true },
  ];
};

export default (h, s) => note(h, s, 4.5);

export const open = (h, s) => note(h, s, 6.5);
