/** Built along its 45° axis: tip bottom left, a round end top right, a ferrule line near the end. */
const pencil = ({ poly }, s) => {
  const tip = [3.125, 14.875];
  const w = 1.75;
  const at = (a, b) => [
    tip[0] + (a + b) * Math.SQRT1_2,
    tip[1] + (b - a) * Math.SQRT1_2,
  ];
  const shoulder = 3.5;
  const end = 15;
  const ferrule = 11.75;
  return [
    poly([tip, at(shoulder, w), at(end, w), at(end, -w), at(shoulder, -w)], {
      closed: true,
      corners: { 0: 0.5, 1: s.ease / 2, 2: s.ease, 3: s.ease, 4: s.ease / 2 },
    }),
    poly([at(ferrule, -w), at(ferrule, w)]),
  ];
};

export default pencil;

/** A written line runs under the pencil, clear of its lower edge. */
export const open = (h, s) => [
  pencil(h, s),
  `M 9 ${s.keylines.square[3]} H ${s.keylines.square[2]}`,
];
