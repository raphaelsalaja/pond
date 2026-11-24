const handle = "M 6.25 7 V 5.375 A 2.75 2.75 0 0 1 11.75 5.375 V 7";
const corners = (s, top) => ({
  0: s.ease,
  [top + 1]: s.ease,
  [top + 2]: s.box,
  [top + 3]: s.box,
});

export default ({ poly }, s) => [
  poly(
    [
      [4.5, 7],
      [13.5, 7],
      [15.625, 15.625],
      [2.375, 15.625],
    ],
    { closed: true, corners: corners(s, 0) },
  ),
  handle,
];

export const open = ({ poly }, s) => [
  poly(
    [
      [4.5, 7],
      [9, 10],
      [13.5, 7],
      [15.625, 15.625],
      [2.375, 15.625],
    ],
    { closed: true, corners: { ...corners(s, 1), 1: s.ease } },
  ),
  handle,
];
