export default ({ poly }, s) =>
  poly(
    [
      [3.875, 9.375],
      [7, 12.5],
      [14.125, 5.375],
    ],
    { radius: s.ease },
  );
