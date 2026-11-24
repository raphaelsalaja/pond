import dot from "./parts/dot.mjs";

/** A fan of four scallops; ribs run from the hinge to the valleys between them. */
export default ({ pt }) => {
  const [cx, cy, r] = [9, 10.875, 7];
  const ends = [2.375, 15.625].map((x) =>
    Math.atan2(-Math.sqrt(r * r - (x - cx) ** 2), x - cx),
  );
  const valleys = [0, 1, 2, 3, 4].map((i) => {
    const a =
      ends[0] + ((ends[1] - ends[0] + 2 * Math.PI) % (2 * Math.PI)) * (i / 4);
    return pt([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  });
  const hem = valleys
    .slice(1)
    .map((v) => `A 2.75 2.75 0 0 1 ${v}`)
    .join(" ");
  const hinge = 12.25;
  return [
    `M 7.5 14.375 L ${valleys[0]} ${hem} L 10.5 14.375 L 11.25 15.625 H 6.75 Z`,
    valleys.slice(1, 4).map((v) => `M 9 ${hinge} L ${v}`),
  ];
};

/** The clam opens on its left hinge and shows a pearl. */
export const open = (h, s) => [
  "M 3.375 11 H 14.625 A 5.625 4.625 0 0 1 3.375 11 Z",
  "M 3.375 10 L 10.875 2.875 A 5.25 3.25 -43.5 0 0 3.375 10 Z",
  dot(h, s, 11.25, 7.875),
];
