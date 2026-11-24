export default ({ arc, poly }, s) => {
  const [cx, cy, r] = s.keylines.circle;
  const dashes = [-60, 0, 60, 120, 180, 240].map((a) =>
    arc(cx, cy, r, a - 18, a + 18),
  );
  return [
    ...dashes,
    poly(
      [
        [9, 5.25],
        [9, 9],
        [11.5, 10.5],
      ],
      { radius: s.ease },
    ),
  ];
};
