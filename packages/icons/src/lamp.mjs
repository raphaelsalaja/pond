const lamp = ({ poly }, s) => [
  poly(
    [
      [6.375, 2.375],
      [11.625, 2.375],
      [14.375, 8.75],
      [3.625, 8.75],
    ],
    { closed: true, radius: s.ease },
  ),
  "M 9 8.75 V 15.625 M 5.75 15.625 H 12.25",
];

export default lamp;

export const open = (h, s) => [lamp(h, s), "M 4.75 11 L 3.25 12.5 M 13.25 11 L 14.75 12.5"];
