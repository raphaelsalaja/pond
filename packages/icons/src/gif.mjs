/** G, I and F on the wide keyline, 8 tall. */
export default ({ poly }, s) => {
  const [x0, , x1] = s.keylines.wide;
  const t = 5;
  const b = 13;
  const mid = 9.25;
  return [
    poly(
      [
        [6.875, t],
        [x0, t],
        [x0, b],
        [6.875, b],
        [6.875, mid],
        [5.125, mid],
      ],
      { corners: { 1: 1.75, 2: 1.75, 3: 1.75, 4: 0.5 } },
    ),
    `M 9.375 ${t} V ${b}`,
    poly(
      [
        [x1, t],
        [11.875, t],
        [11.875, b],
      ],
      { corners: { 1: 0.5 } },
    ),
    `M 11.875 9 H 14.75`,
  ];
};
