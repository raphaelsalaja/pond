export default ({ poly }, s) =>
  poly(
    [
      [4.875, 7],
      [9, 11.125],
      [13.125, 7],
    ],
    { radius: s.ease },
  );
