/** Built along its 45° axis: a fanned bristle head bound below the handle. */
const at = (a, b) => [4.5 + (a + b) * Math.SQRT1_2, 13.5 + (b - a) * Math.SQRT1_2];

export default ({ poly, snap }, s) => {
  const P = (a, b) => at(a, b).map(snap);
  const [base, bind, neck, end] = [0, 3.75, 6.5, 15.25];
  const half = (a) => 4.5 - ((4.5 - 1.75) * (a - base)) / (neck - base);
  return [
    poly([P(base, -half(base)), P(neck, -half(neck)), P(neck, half(neck)), P(base, half(base))], {
      closed: true,
      corners: { 0: s.ease, 1: s.ease / 2, 2: s.ease / 2, 3: s.ease },
    }),
    `M ${P(bind, -half(bind)).join(" ")} L ${P(bind, half(bind)).join(" ")}`,
    `M ${P(neck, 0).join(" ")} L ${P(end, 0).join(" ")}`,
  ];
};
