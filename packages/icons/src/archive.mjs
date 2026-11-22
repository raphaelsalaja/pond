/** The lid is wider than the box. */
export default ({ poly, rect }, s) => {
  const [x0, , x1] = s.keylines.wide;
  const [top, lid, bottom] = [3, 6.5, 15];
  return [
    rect(x0, top, x1 - x0, lid - top, s.ease),
    poly(
      [
        [x0 + 1, lid],
        [x1 - 1, lid],
        [x1 - 1, bottom],
        [x0 + 1, bottom],
      ],
      { closed: true, corners: { 0: 0, 1: 0, 2: s.box, 3: s.box } },
    ),
    "M 7.25 9.5 H 10.75",
  ];
};

/** The lid lifts to the top edge; the box keeps its width and handle, clear of the lid. */
export const open = ({ rect }, s) => {
  const [x0, , x1] = s.keylines.wide;
  const [top, lid, box, bottom] = [2.375, 5.875, 8.375, 15.375];
  return [
    rect(x0, top, x1 - x0, lid - top, s.ease),
    rect(x0 + 1, box, x1 - x0 - 2, bottom - box, s.box),
    `M 7.25 ${box + 3} H 10.75`,
  ];
};
