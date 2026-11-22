const mug = (poly, s) => [
  poly(
    [
      [2.375, 7.5],
      [12.125, 7.5],
      [12.125, 15.625],
      [2.375, 15.625],
    ],
    { closed: true, corners: { 0: s.ease, 1: s.ease, 2: s.box, 3: s.box } },
  ),
  "M 12.125 9.25 H 13.375 A 2 2 0 0 1 13.375 13.25 H 12.125",
];
const steam = (x) => `M ${x} 5 C ${x - 0.875} 4.25 ${x + 0.875} 3.125 ${x} 2.375`;

export default ({ poly }, s) => [mug(poly, s), steam(5.5), steam(9)];

export const open = ({ poly }, s) => [mug(poly, s), steam(4.25), steam(7.25), steam(10.25)];
