const watch = ({ circle, poly }, s, cx, cy, r) => [
  circle(cx, cy, r),
  `M ${cx - 1.25} 2.375 H ${cx + 1.25} M ${cx} 2.375 V ${cy - r}`,
  poly(
    [
      [cx, cy - 2.625],
      [cx, cy],
      [cx + 2.125, cy],
    ],
    { radius: s.ease },
  ),
];

export default (h, s) => watch(h, s, 9, 10.125, 5.5);

/** The lid swings open on the left hinge, seen edge-on. */
export const open = (h, s) => {
  const [cx, cy, r] = [10.75, 10.25, 4.875];
  const [x, rx] = [cx - r, 1.5];
  return [
    watch(h, s, cx, cy, r),
    `M ${x - 2 * rx} ${cy} A ${rx} ${r} 0 1 0 ${x} ${cy} A ${rx} ${r} 0 1 0 ${x - 2 * rx} ${cy} Z`,
  ];
};
