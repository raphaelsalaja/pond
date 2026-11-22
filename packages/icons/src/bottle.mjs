const body = (top) => [
  [7.375, top],
  [10.625, top],
  [10.625, 6.25],
  [13.125, 8.75],
  [13.125, 15.625],
  [4.875, 15.625],
  [4.875, 8.75],
  [7.375, 6.25],
];

export default ({ poly }, s) => [
  poly(body(2.375), { closed: true, radius: s.ease, corners: { 4: s.box, 5: s.box } }),
  "M 7.375 4.75 H 10.625",
];

/** The cap sits off the open neck, tipped. */
export const open = ({ poly }, s) => [
  poly([[10.625, 4.375], ...body(4.375).slice(2), [7.375, 4.375]], { radius: s.ease, corners: { 3: s.box, 4: s.box } }),
  poly(
    [
      [11.875, 3.125],
      [14.5, 2.375],
      [15.125, 4.375],
      [12.5, 5.125],
    ],
    { closed: true, radius: 0.75 },
  ),
];
