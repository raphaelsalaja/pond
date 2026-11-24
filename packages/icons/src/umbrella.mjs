import dot from "./parts/dot.mjs";

/** The canopy's hem is four shallow scallops between the rib tips; the shaft drops from the middle tip. */
const umbrella = (cy, r, hook) => {
  const step = r / 2;
  const scallop = Math.round(step * 0.625 * 8) / 8;
  const hem = [1, 2, 3, 4]
    .map((i) => `A ${scallop} ${scallop} 0 0 0 ${9 + r - i * step} ${cy}`)
    .join(" ");
  const end = 14.125;
  return [
    `M ${9 - r} ${cy} A ${r} ${r} 0 0 1 ${9 + r} ${cy} ${hem} Z`,
    `M 9 ${cy} V ${end} A ${hook} ${hook} 0 0 1 ${9 - 2 * hook} ${end}`,
  ];
};

export default () => umbrella(9.25, 6, 1.375);

/** Rain falls on a smaller canopy. */
export const open = (h, s) => [
  umbrella(10.5, 5, 1.25),
  dot(h, s, 9, 2.75, 1),
  dot(h, s, 4.5, 4.25, 1),
  dot(h, s, 13.5, 4.25, 1),
];
