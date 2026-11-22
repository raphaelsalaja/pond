export default ({ poly }, s) =>
  poly(
    [
      [4.625, 4.625],
      [6.875, 2.375],
      [13.5, 9],
      [6.875, 15.625],
      [4.625, 13.375],
      [9, 9],
    ],
    { closed: true, radius: s.ease },
  );
