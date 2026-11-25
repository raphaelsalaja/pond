import dot from "./parts/dot.mjs";

/** A root ring branching to leaf dots along one spine. */
const map = (h, s, leaves) => {
  const r = 2;
  const root = s.keylines.square[0] + r;
  const spine = 8.75;
  const leaf = 13.875;
  const [top, bottom] = [leaves[0], leaves.at(-1)];
  return [
    h.circle(root, 9, r),
    `M ${root + r} 9 H ${leaves.includes(9) ? leaf : spine}`,
    h.poly(
      [
        [leaf, top],
        [spine, top],
        [spine, bottom],
        [leaf, bottom],
      ],
      { radius: s.ease },
    ),
    ...leaves.map((y) => dot(h, s, leaf + 0.5, y)),
  ];
};

export default (h, s) => map(h, s, [4.75, 13.25]);

export const open = (h, s) => map(h, s, [4.125, 9, 13.875]);
