import dot from "./parts/dot.mjs";

/** Turns a point about the centre by `deg`. */
const turn =
  (snap, deg) =>
  ([x, y]) => {
    const a = (deg * Math.PI) / 180;
    return [
      snap(9 + (x - 9) * Math.cos(a) - (y - 9) * Math.sin(a)),
      snap(9 + (x - 9) * Math.sin(a) + (y - 9) * Math.cos(a)),
    ];
  };

const die = (h, s, size, pips, deg) => {
  const t = turn(h.snap, deg);
  const [a, b] = [9 - size / 2, 9 + size / 2];
  return [
    h.poly(
      [
        [a, a],
        [b, a],
        [b, b],
        [a, b],
      ].map(t),
      { closed: true, corners: { 0: s.box, 1: s.box, 2: s.box, 3: s.box } },
    ),
    pips.map(t).map(([x, y]) => dot(h, s, x, y)),
  ];
};

export default (h, s) =>
  die(
    h,
    s,
    13.25,
    [
      [5.75, 5.75],
      [9, 9],
      [12.25, 12.25],
    ],
    0,
  );

export const open = (h, s) =>
  die(
    h,
    s,
    11,
    [
      [6.625, 6.625],
      [9, 9],
      [11.375, 11.375],
    ],
    15,
  );
