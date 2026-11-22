const rod = "M 2.375 2.375 H 15.625";

/** The drawn panels hang from a rod that runs past them, split where they meet. */
export default ({ poly }, s) => [
  rod,
  poly(
    [
      [3.375, 2.375],
      [3.375, 15.625],
      [14.625, 15.625],
      [14.625, 2.375],
    ],
    { corners: { 1: s.box, 2: s.box } },
  ),
  "M 9 2.375 V 15.625",
];

/** Each panel is drawn on the left and mirrored. */
export const open = () => {
  const panel = (f) => {
    const x = (v) => (f > 0 ? v : 18 - v);
    return `M ${x(3.375)} 2.375 V 13.375 A 2.25 2.25 0 0 ${f > 0 ? 0 : 1} ${x(5.625)} 15.625 H ${x(6.625)} C ${x(6.625)} 13.125 ${x(5.125)} 11.125 ${x(5.125)} 9.5 C ${x(5.125)} 7.875 ${x(7.375)} 5.5 ${x(7.375)} 2.375`;
  };
  return [rod, panel(1), panel(-1)];
};
