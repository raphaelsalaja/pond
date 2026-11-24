/** A tipped paint bucket, its level across the middle, and a solid drop falling off the lip. */
export default ({ poly }, s) => {
  const [cx, cy, half] = [7.5, 8.375, 5.125];
  const inset = 0.5;
  return [
    poly(
      [
        [cx, cy - half],
        [cx + half, cy],
        [cx, cy + half],
        [cx - half, cy],
      ],
      { closed: true, radius: s.ease },
    ),
    `M ${cx - half + inset} ${cy} H ${cx + half - inset}`,
    {
      d: "M 14.375 10.625 L 15.5 12.5 A 1.375 1.375 0 1 1 13.25 12.5 Z",
      solid: true,
    },
  ];
};
