/** A lens between two points, bulging `sag` to each side of the chord. */
const lens = (snap, a, b, sag) => {
  const half = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
  const r = snap((half * half + sag * sag) / (2 * sag));
  const p = (q) => q.map(snap).join(" ");
  return `M ${p(a)} A ${r} ${r} 0 0 1 ${p(b)} A ${r} ${r} 0 0 1 ${p(a)} Z`;
};

export default ({ snap }) => [lens(snap, [5.25, 12.75], [15.375, 2.625], 2.75), "M 2.625 15.375 L 11.75 6.25"];

export const open = ({ snap }) => [
  "M 9 15.625 V 9.5",
  lens(snap, [9, 9.5], [2.625, 4], 1.875),
  lens(snap, [15.375, 4], [9, 9.5], 1.875),
];
