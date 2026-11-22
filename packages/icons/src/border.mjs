/** A dashed box: four corners and one dash per side; caps eat 1.25 of every gap. */
export default ({ poly }, s) => {
  const [lo, , hi] = s.keylines.square;
  const arm = 3.125;
  const [a, b] = [8.125, 9.875];
  const corner = (x, y, dx, dy) =>
    poly(
      [
        [x, y + dy * arm],
        [x, y],
        [x + dx * arm, y],
      ],
      { corners: { 1: s.box } },
    );
  return [
    corner(lo, lo, 1, 1),
    corner(hi, lo, -1, 1),
    corner(hi, hi, -1, -1),
    corner(lo, hi, 1, -1),
    `M ${a} ${lo} H ${b}`,
    `M ${a} ${hi} H ${b}`,
    `M ${lo} ${a} V ${b}`,
    `M ${hi} ${a} V ${b}`,
  ];
};
