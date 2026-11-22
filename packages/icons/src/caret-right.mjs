export default ({ poly }) => ({
  solid: true,
  d: poly(
    [
      [6.75, 3.75],
      [12, 9],
      [6.75, 14.25],
    ],
    { closed: true, corners: { 0: 0.625, 1: 0.875, 2: 0.625 } },
  ),
});
