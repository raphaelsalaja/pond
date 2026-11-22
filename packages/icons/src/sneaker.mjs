const shoe = ({ poly }, s) => {
  const [x0, , x1, y1] = s.keylines.square;
  return [
    poly(
      [
        [x0, 4.375],
        [6.25, 4.375],
        [10.5, 8.625],
        [x1, 8.625],
        [x1, y1],
        [x0, y1],
      ],
      { closed: true, corners: { 0: s.ease, 1: s.ease, 2: s.ease, 3: 3, 4: s.box, 5: s.box } },
    ),
    `M ${x0} 12.875 H ${x1}`,
  ];
};

export default (h, s) => [shoe(h, s), "M 7.25 5.375 L 5.875 6.75 M 9.5 7.625 L 8.125 9"];

/** The laces come loose and fly up. */
export const open = (h, s) => [shoe(h, s), "M 7.25 5.375 L 8.625 4 M 9.5 7.625 L 10.875 6.25"];
