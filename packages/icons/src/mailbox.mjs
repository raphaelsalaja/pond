const top = 5.5;
const bottom = 11.75;
const door = 5.75;

const box = () => {
  const r = (bottom - top) / 2;
  return [
    `M ${door} ${top} H 13.375 A 2.25 2.25 0 0 1 15.625 ${top + 2.25} V ${bottom - 2.25} A 2.25 2.25 0 0 1 13.375 ${bottom} H ${door} A ${r} ${r} 0 0 1 ${door} ${top} Z`,
    `M ${door} ${top} V ${bottom}`,
    `M 12 ${bottom} V 15.625`,
  ];
};

export default () => [box(), `M 8.75 8.625 H 12.75`];

export const open = ({ poly }, s) => [
  box(),
  poly(
    [
      [13, top],
      [13, 2.375],
      [9.75, 2.375],
    ],
    { radius: s.ease / 2 },
  ),
];
