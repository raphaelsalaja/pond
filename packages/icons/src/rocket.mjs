import dot from "./parts/dot.mjs";

const fin = (h, s, x, tip, y) =>
  h.poly(
    [
      [x, y(9)],
      [tip, y(11.375)],
      [tip, y(13.75)],
      [x, y(12.125)],
    ],
    { radius: s.ease },
  );

const rocket = (h, s, dy) => {
  const y = (v) => v + dy;
  const [l, r, e] = [6, 12, s.ease];
  return [
    `M ${l} ${y(7.625)} A 6.5 6.5 0 0 1 9 ${y(2.375)} A 6.5 6.5 0 0 1 ${r} ${y(7.625)} V ${y(11)} A ${e} ${e} 0 0 1 ${r - e} ${y(12.25)} H ${l + e} A ${e} ${e} 0 0 1 ${l} ${y(11)} Z`,
    fin(h, s, l, 3.375, y),
    fin(h, s, r, 14.625, y),
    dot(h, s, 9, y(7.375)),
  ];
};

export default (h, s) => rocket(h, s, 0.75);

export const open = (h, s) => [
  rocket(h, s, 0),
  h.poly(
    [
      [7.625, 12.25],
      [9, 15.625],
      [10.375, 12.25],
    ],
    { corners: { 1: 0.75 } },
  ),
];
